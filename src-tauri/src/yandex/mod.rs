use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener},
    path::PathBuf,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicU32, AtomicU64, Ordering},
        OnceLock, RwLock,
    },
    time::{Duration, Instant},
};
use sysinfo::System;
use tokio::net::TcpStream as TokioTcpStream;
use tokio::sync::Mutex as AsyncMutex;
use tokio::time::{sleep, timeout};
use tokio_tungstenite::{connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream};

use crate::media::{health, MediaCommand, MediaProvider, MediaSnapshot, PlaybackStatus};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
const RPC_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_DISCOVERY_RESPONSE_BYTES: usize = 256 * 1024;
static PROBE_FAILURES: AtomicU32 = AtomicU32::new(0);
static DISCOVERIES: AtomicU64 = AtomicU64::new(0);
static WEBSOCKET_CONNECTS: AtomicU64 = AtomicU64::new(0);
static RECONNECTS: AtomicU64 = AtomicU64::new(0);
static EVALUATIONS: AtomicU64 = AtomicU64::new(0);
static COMMANDS: AtomicU64 = AtomicU64::new(0);
static RPC_RTT_TOTAL_MS: AtomicU64 = AtomicU64::new(0);
static RPC_RTT_MAX_MS: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DirectYandexState {
    Disabled,
    Connecting,
    Connected,
    Degraded,
    RestartRequired,
    Incompatible,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectYandexStatus {
    pub state: DirectYandexState,
    pub message: String,
    pub port: Option<u16>,
    pub executable_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectMetrics {
    pub discoveries: u64,
    pub websocket_connects: u64,
    pub reconnects: u64,
    pub evaluations: u64,
    pub commands: u64,
    pub consecutive_failures: u32,
    pub average_rpc_rtt_ms: u64,
    pub max_rpc_rtt_ms: u64,
    pub persistent_socket_open: bool,
}

pub async fn metrics() -> DirectMetrics {
    let evaluations = EVALUATIONS.load(Ordering::Relaxed);
    DirectMetrics {
        discoveries: DISCOVERIES.load(Ordering::Relaxed),
        websocket_connects: WEBSOCKET_CONNECTS.load(Ordering::Relaxed),
        reconnects: RECONNECTS.load(Ordering::Relaxed),
        evaluations,
        commands: COMMANDS.load(Ordering::Relaxed),
        consecutive_failures: PROBE_FAILURES.load(Ordering::Relaxed),
        average_rpc_rtt_ms: if evaluations == 0 {
            0
        } else {
            RPC_RTT_TOTAL_MS.load(Ordering::Relaxed) / evaluations
        },
        max_rpc_rtt_ms: RPC_RTT_MAX_MS.load(Ordering::Relaxed),
        persistent_socket_open: actor_lock().lock().await.is_some(),
    }
}

impl Default for DirectYandexStatus {
    fn default() -> Self {
        Self {
            state: DirectYandexState::Disabled,
            message: "Windows SMTC is active".into(),
            port: None,
            executable_path: None,
        }
    }
}

fn status_lock() -> &'static RwLock<DirectYandexStatus> {
    static STATUS: OnceLock<RwLock<DirectYandexStatus>> = OnceLock::new();
    STATUS.get_or_init(|| RwLock::new(DirectYandexStatus::default()))
}

type CdpSocket = WebSocketStream<MaybeTlsStream<TokioTcpStream>>;

struct CdpConnection {
    port: u16,
    socket: CdpSocket,
    next_id: u64,
}

fn actor_lock() -> &'static AsyncMutex<Option<CdpConnection>> {
    static ACTOR: OnceLock<AsyncMutex<Option<CdpConnection>>> = OnceLock::new();
    ACTOR.get_or_init(|| AsyncMutex::new(None))
}

pub fn status() -> DirectYandexStatus {
    status_lock()
        .read()
        .expect("Yandex direct status lock poisoned")
        .clone()
}

fn set_status(next: DirectYandexStatus) {
    *status_lock()
        .write()
        .expect("Yandex direct status lock poisoned") = next;
}

pub fn record_probe_success() {
    PROBE_FAILURES.store(0, Ordering::Relaxed);
    let current = status();
    if current.state == DirectYandexState::Degraded {
        set_status(DirectYandexStatus {
            state: DirectYandexState::Connected,
            message: "Direct connection is active".into(),
            ..current
        });
    }
}

pub fn record_probe_failure(message: &str) {
    let failures = PROBE_FAILURES.fetch_add(1, Ordering::Relaxed) + 1;
    let current = status();
    if matches!(
        current.state,
        DirectYandexState::Connected | DirectYandexState::Degraded
    ) {
        set_status(DirectYandexStatus {
            state: DirectYandexState::Degraded,
            message: format!("Reconnecting direct endpoint ({failures}): {message}"),
            ..current
        });
    }
}

pub async fn enable() -> anyhow::Result<DirectYandexStatus> {
    if let Some((port, executable)) = find_running_debug_endpoint() {
        match attach_existing(port, executable.clone()).await {
            Ok(status) => return Ok(status),
            Err(error) => crate::logging::append_event(&format!(
                "existing direct endpoint rejected before explicit restart: {error:#}"
            )),
        }
    }

    let executable =
        find_executable().ok_or_else(|| anyhow::anyhow!("Yandex Music Desktop was not found"))?;
    let port = reserve_local_port()?;
    crate::logging::append_event(&format!(
        "direct Yandex enable requested: executable={}, port={port}",
        executable.display()
    ));
    set_status(DirectYandexStatus {
        state: DirectYandexState::Connecting,
        message: "Restarting Yandex Music with a local debug endpoint…".into(),
        port: Some(port),
        executable_path: Some(executable.to_string_lossy().into_owned()),
    });

    stop_client();
    sleep(Duration::from_millis(600)).await;
    Command::new(&executable)
        .arg(format!("--remote-debugging-port={port}"))
        .arg("--remote-debugging-address=127.0.0.1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| anyhow::anyhow!("failed to launch Yandex Music: {error}"))?;

    let started = std::time::Instant::now();
    let mut last_error = "local debug endpoint is not ready".to_string();
    while started.elapsed() < CONNECT_TIMEOUT {
        match evaluate(port, STATE_EXPRESSION).await {
            Ok(value) if value.get("ready").and_then(Value::as_bool) == Some(true) => {
                crate::logging::append_event(&format!("direct Yandex connected: port={port}"));
                let next = DirectYandexStatus {
                    state: DirectYandexState::Connected,
                    message: "Direct connection is active".into(),
                    port: Some(port),
                    executable_path: Some(executable.to_string_lossy().into_owned()),
                };
                set_status(next.clone());
                return Ok(next);
            }
            Ok(_) => {
                last_error = "renderer opened, but player controls are still loading".into();
            }
            Err(error) => {
                last_error = format!("endpoint connection failed: {error:#}");
            }
        }
        sleep(Duration::from_millis(300)).await;
    }

    let next = DirectYandexStatus {
        state: DirectYandexState::Error,
        message: format!("Yandex Music direct connection failed: {last_error}"),
        port: Some(port),
        executable_path: Some(executable.to_string_lossy().into_owned()),
    };
    set_status(next.clone());
    crate::logging::append_event(&format!(
        "direct Yandex connection failed: {}",
        next.message
    ));
    Err(anyhow::anyhow!(next.message))
}

pub async fn reattach(port_hint: Option<u16>) -> anyhow::Result<DirectYandexStatus> {
    let candidate = find_running_debug_endpoint();
    let Some((port, executable)) = candidate else {
        let next = DirectYandexStatus {
            state: DirectYandexState::RestartRequired,
            message: "Direct endpoint is not running. Reconnect explicitly in Settings.".into(),
            port: port_hint,
            executable_path: find_executable().map(|path| path.to_string_lossy().into_owned()),
        };
        set_status(next.clone());
        anyhow::bail!(next.message)
    };
    match attach_existing(port, executable.clone()).await {
        Ok(status) => Ok(status),
        Err(error) => {
            let next = DirectYandexStatus {
                state: DirectYandexState::RestartRequired,
                message: format!(
                    "Existing endpoint was rejected ({error:#}). Reconnect explicitly in Settings."
                ),
                port: Some(port),
                executable_path: Some(executable.to_string_lossy().into_owned()),
            };
            set_status(next.clone());
            Err(anyhow::anyhow!(next.message))
        }
    }
}

async fn attach_existing(port: u16, executable: PathBuf) -> anyhow::Result<DirectYandexStatus> {
    set_status(DirectYandexStatus {
        state: DirectYandexState::Connecting,
        message: "Attaching to the existing local debug endpoint…".into(),
        port: Some(port),
        executable_path: Some(executable.to_string_lossy().into_owned()),
    });
    let value = evaluate(port, STATE_EXPRESSION).await?;
    if value.get("ready").and_then(Value::as_bool) != Some(true) {
        anyhow::bail!("existing endpoint does not expose ready player controls");
    }
    let next = DirectYandexStatus {
        state: DirectYandexState::Connected,
        message: "Reattached without restarting Yandex Music".into(),
        port: Some(port),
        executable_path: Some(executable.to_string_lossy().into_owned()),
    };
    PROBE_FAILURES.store(0, Ordering::Relaxed);
    set_status(next.clone());
    crate::logging::append_event(&format!(
        "direct Yandex reattached to validated process endpoint: port={port}"
    ));
    Ok(next)
}

pub async fn disable(restart_plain: bool) -> anyhow::Result<DirectYandexStatus> {
    let executable = status()
        .executable_path
        .as_deref()
        .map(PathBuf::from)
        .or_else(find_executable);
    set_status(DirectYandexStatus::default());
    *actor_lock().lock().await = None;
    if restart_plain {
        stop_client();
        sleep(Duration::from_millis(500)).await;
        if let Some(executable) = executable {
            Command::new(executable)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()?;
        }
    }
    Ok(status())
}

pub async fn snapshot() -> anyhow::Result<MediaSnapshot> {
    let port = status()
        .port
        .ok_or_else(|| anyhow::anyhow!("direct Yandex connection is disabled"))?;
    let value = evaluate(port, STATE_EXPRESSION).await?;
    if value.get("ready").and_then(Value::as_bool) != Some(true) {
        anyhow::bail!("Yandex player controls are temporarily unavailable");
    }
    log_capabilities_once(&value);

    let position_ms = value
        .get("position")
        .and_then(Value::as_f64)
        .map(|v| (v * 1_000.0) as i64);
    let duration_ms = value
        .get("duration")
        .and_then(Value::as_f64)
        .map(|v| (v * 1_000.0) as i64);
    Ok(MediaSnapshot {
        has_session: true,
        source_app_id: Some("YandexMusic.Direct".into()),
        title: string_field(&value, "title"),
        artist: string_field(&value, "artist"),
        album_title: None,
        playback_status: if value.get("playing").and_then(Value::as_bool) == Some(true) {
            PlaybackStatus::Playing
        } else {
            PlaybackStatus::Paused
        },
        position_ms,
        duration_ms,
        can_seek: duration_ms.unwrap_or(0) > 0,
        can_go_next: value
            .get("canNext")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        can_go_previous: value
            .get("canPrev")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        can_play: true,
        can_pause: true,
        can_like: value
            .get("canLike")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        can_dislike: value
            .get("canDislike")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        is_liked: value.get("liked").and_then(Value::as_bool).unwrap_or(false),
        is_disliked: value
            .get("disliked")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        thumbnail_data_url: string_field(&value, "cover"),
        updated_at: chrono::Utc::now().to_rfc3339(),
        provider: MediaProvider::YandexDirect,
        smtc_health: health::current().status,
    })
}

pub async fn send_command(command: MediaCommand) -> anyhow::Result<()> {
    COMMANDS.fetch_add(1, Ordering::Relaxed);
    let port = status()
        .port
        .ok_or_else(|| anyhow::anyhow!("direct Yandex connection is disabled"))?;
    let expression = match command {
        MediaCommand::Play | MediaCommand::Pause | MediaCommand::PlayPause => {
            click_expression(&["PAUSE_BUTTON", "PLAY_BUTTON"])
        }
        MediaCommand::Next => click_expression(&["NEXT_TRACK_BUTTON"]),
        MediaCommand::Previous => click_expression(&["PREVIOUS_TRACK_BUTTON"]),
        MediaCommand::Stop => click_expression(&["PAUSE_BUTTON"]),
        MediaCommand::Like => click_expression(&["LIKE_BUTTON"]),
        MediaCommand::Dislike => click_expression(&["DISLIKE_BUTTON"]),
        MediaCommand::Seek { position_ms } => seek_expression(position_ms),
    };
    let result = evaluate(port, &expression).await?;
    if result.as_bool() != Some(true) {
        crate::logging::append_event("direct Yandex command was rejected by renderer");
        anyhow::bail!("Yandex Music rejected the direct command");
    }
    Ok(())
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn reserve_local_port() -> anyhow::Result<u16> {
    let listener = TcpListener::bind(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0))?;
    Ok(listener.local_addr()?.port())
}

fn find_executable() -> Option<PathBuf> {
    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from)?;
    [
        local
            .join("Programs")
            .join("YandexMusic")
            .join("Яндекс Музыка.exe"),
        local
            .join("Programs")
            .join("YandexMusic")
            .join("Yandex Music.exe"),
    ]
    .into_iter()
    .find(|path| path.is_file())
}

fn find_running_debug_endpoint() -> Option<(u16, PathBuf)> {
    let system = System::new_all();
    system.processes().values().find_map(|process| {
        let executable = process.exe()?.to_path_buf();
        let name = executable.file_name()?.to_string_lossy().to_lowercase();
        if !name.contains("yandex music") && !name.contains("яндекс музыка") {
            return None;
        }
        let port = process.cmd().iter().find_map(|argument| {
            argument
                .to_string_lossy()
                .strip_prefix("--remote-debugging-port=")?
                .parse::<u16>()
                .ok()
        })?;
        Some((port, executable))
    })
}

#[cfg(windows)]
fn stop_client() {
    let _ = Command::new("taskkill")
        .args(["/F", "/T", "/IM", "Яндекс Музыка.exe"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    let _ = Command::new("taskkill")
        .args(["/F", "/T", "/IM", "Yandex Music.exe"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(not(windows))]
fn stop_client() {}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DebugTarget {
    #[serde(rename = "type")]
    kind: String,
    url: String,
    web_socket_debugger_url: String,
}

async fn discover_target(port: u16) -> anyhow::Result<DebugTarget> {
    DISCOVERIES.fetch_add(1, Ordering::Relaxed);
    let targets = timeout(
        RPC_TIMEOUT,
        tauri::async_runtime::spawn_blocking(move || discover_targets_blocking(port)),
    )
    .await
    .map_err(|_| anyhow::anyhow!("CDP discovery timeout"))?
    .map_err(|error| anyhow::anyhow!("CDP discovery worker failed: {error}"))??;
    targets
        .into_iter()
        .find(is_valid_target)
        .ok_or_else(|| anyhow::anyhow!("Yandex Music renderer target was not found"))
}

fn is_valid_target(target: &DebugTarget) -> bool {
    target.kind == "page" && target.url.starts_with("music-application://")
}

fn discover_targets_blocking(port: u16) -> anyhow::Result<Vec<DebugTarget>> {
    let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    let mut stream = std::net::TcpStream::connect_timeout(&address, RPC_TIMEOUT)?;
    stream.set_read_timeout(Some(RPC_TIMEOUT))?;
    stream.set_write_timeout(Some(RPC_TIMEOUT))?;
    stream.write_all(
        format!(
            "GET /json HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\nAccept: application/json\r\n\r\n"
        )
        .as_bytes(),
    )?;
    let mut response = Vec::with_capacity(8 * 1024);
    let header_end = loop {
        if response.len() >= MAX_DISCOVERY_RESPONSE_BYTES {
            anyhow::bail!("CDP discovery response headers are too large");
        }
        let mut chunk = [0_u8; 4096];
        let read = stream.read(&mut chunk)?;
        if read == 0 {
            anyhow::bail!("CDP discovery connection closed before response headers");
        }
        response.extend_from_slice(&chunk[..read]);
        if let Some(position) = response.windows(4).position(|window| window == b"\r\n\r\n") {
            break position + 4;
        }
    };
    let headers = std::str::from_utf8(&response[..header_end])?;
    if !headers.starts_with("HTTP/1.1 200") && !headers.starts_with("HTTP/1.0 200") {
        anyhow::bail!("CDP discovery returned non-200 status");
    }
    let content_length = headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        })
        .ok_or_else(|| anyhow::anyhow!("CDP discovery response has no Content-Length"))?;
    if content_length > MAX_DISCOVERY_RESPONSE_BYTES {
        anyhow::bail!("CDP discovery response body is too large");
    }
    while response.len() - header_end < content_length {
        let mut chunk = [0_u8; 4096];
        let read = stream.read(&mut chunk)?;
        if read == 0 {
            anyhow::bail!("CDP discovery connection closed before response body");
        }
        response.extend_from_slice(&chunk[..read]);
    }
    Ok(serde_json::from_slice(
        &response[header_end..header_end + content_length],
    )?)
}

fn log_capabilities_once(value: &Value) {
    use std::sync::atomic::{AtomicBool, Ordering};
    static LOGGED: AtomicBool = AtomicBool::new(false);
    if LOGGED.swap(true, Ordering::Relaxed) {
        return;
    }
    crate::logging::append_event(&format!(
        "direct Yandex capabilities: next={}, previous={}, seek={}, like={}, dislike={}",
        value
            .get("canNext")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        value
            .get("canPrev")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        value.get("duration").and_then(Value::as_f64).unwrap_or(0.0) > 0.0,
        value
            .get("canLike")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        value
            .get("canDislike")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    ));
}

async fn evaluate(port: u16, expression: &str) -> anyhow::Result<Value> {
    let mut actor = actor_lock().lock().await;
    if actor
        .as_ref()
        .is_some_and(|connection| connection.port != port)
    {
        *actor = None;
    }
    if actor.is_none() {
        *actor = Some(connect_actor(port).await?);
    }

    match evaluate_on_socket(actor.as_mut().expect("CDP actor initialized"), expression).await {
        Ok(value) => Ok(value),
        Err(first_error) => {
            *actor = None;
            RECONNECTS.fetch_add(1, Ordering::Relaxed);
            let mut connection = connect_actor(port).await.map_err(|reconnect_error| {
                anyhow::anyhow!(
                    "CDP request failed ({first_error:#}); reconnect failed ({reconnect_error:#})"
                )
            })?;
            let value = evaluate_on_socket(&mut connection, expression).await?;
            *actor = Some(connection);
            Ok(value)
        }
    }
}

async fn connect_actor(port: u16) -> anyhow::Result<CdpConnection> {
    let target = discover_target(port).await?;
    if !websocket_matches_endpoint(port, &target.web_socket_debugger_url) {
        anyhow::bail!("renderer websocket is not bound to the validated loopback endpoint");
    }
    let (socket, _) = timeout(RPC_TIMEOUT, connect_async(&target.web_socket_debugger_url))
        .await
        .map_err(|_| anyhow::anyhow!("CDP websocket timeout"))??;
    WEBSOCKET_CONNECTS.fetch_add(1, Ordering::Relaxed);
    Ok(CdpConnection {
        port,
        socket,
        next_id: 1,
    })
}

fn websocket_matches_endpoint(port: u16, url: &str) -> bool {
    url.starts_with(&format!("ws://127.0.0.1:{port}/"))
        || url.starts_with(&format!("ws://localhost:{port}/"))
}

async fn evaluate_on_socket(
    connection: &mut CdpConnection,
    expression: &str,
) -> anyhow::Result<Value> {
    let request_id = connection.next_id;
    connection.next_id = connection.next_id.wrapping_add(1).max(1);
    let started = Instant::now();
    connection
        .socket
        .send(Message::Text(
            json!({
                "id": request_id,
                "method": "Runtime.evaluate",
                "params": {
                    "expression": expression,
                    "returnByValue": true,
                    "awaitPromise": true
                }
            })
            .to_string()
            .into(),
        ))
        .await?;

    let reply = timeout(RPC_TIMEOUT, async {
        while let Some(message) = connection.socket.next().await {
            let message = message?;
            match message {
                Message::Text(text) => {
                    let value: Value = serde_json::from_str(&text)?;
                    if value.get("id").and_then(Value::as_u64) == Some(request_id) {
                        return Ok::<Value, anyhow::Error>(value);
                    }
                }
                Message::Ping(payload) => {
                    connection.socket.send(Message::Pong(payload)).await?;
                }
                Message::Close(_) => anyhow::bail!("CDP websocket closed before reply"),
                _ => {}
            }
        }
        anyhow::bail!("CDP websocket closed before reply")
    })
    .await
    .map_err(|_| anyhow::anyhow!("CDP evaluate timeout"))??;
    let elapsed_ms = started.elapsed().as_millis() as u64;
    EVALUATIONS.fetch_add(1, Ordering::Relaxed);
    RPC_RTT_TOTAL_MS.fetch_add(elapsed_ms, Ordering::Relaxed);
    RPC_RTT_MAX_MS.fetch_max(elapsed_ms, Ordering::Relaxed);

    if let Some(error) = reply.get("error") {
        anyhow::bail!("CDP error: {error}");
    }
    Ok(reply
        .pointer("/result/result/value")
        .cloned()
        .unwrap_or(Value::Null))
}

fn click_expression(ids: &[&str]) -> String {
    let selectors = ids
        .iter()
        .map(|id| format!("\"[data-test-id='{id}']\""))
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "(() => {{ for (const s of [{selectors}]) {{ const e=document.querySelector(s); if(e){{(e.closest('button')||e).click();return true;}} }} return false; }})()"
    )
}

fn seek_expression(position_ms: i64) -> String {
    let seconds = position_ms.max(0) as f64 / 1_000.0;
    format!(
        "(() => {{ const e=document.querySelector(\"input[data-test-id='TIMECODE_SLIDER']\")||document.querySelector(\"[data-test-id='VIBE_PLAYERBAR_TIMECODE_SLIDER'] input[type='range']\"); if(!e)return false; const max=Number(e.max)||0; const end=document.querySelector(\"[data-test-id='TIMECODE_TIME_END']\"); const p=String(end?.textContent||'').split(':').map(Number); const duration=p.length===2?p[0]*60+p[1]:p.length===3?p[0]*3600+p[1]*60+p[2]:max; const value=max>1&&Math.abs(max-duration)<2?Math.min({seconds},max):(duration>0?Math.min(1,{seconds}/duration)*max:0); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(e,String(value)); e.dispatchEvent(new InputEvent('input',{{bubbles:true}})); e.dispatchEvent(new Event('change',{{bubbles:true}})); return true; }})()"
    )
}

const STATE_EXPRESSION: &str = r#"
(() => {
  const q = (...s) => { for (const x of s) { const e=document.querySelector(x); if(e) return e; } return null; };
  const text = (e) => e ? (e.textContent||'').trim() : '';
  const sec = (s) => { const p=String(s||'').split(':').map(Number); return p.length===2?p[0]*60+p[1]:p.length===3?p[0]*3600+p[1]*60+p[2]:0; };
  const play=q("[data-test-id='PAUSE_BUTTON']","[data-test-id='PLAY_BUTTON']");
  const titleRoot=q("[data-test-id='VIBE_PLAYERBAR_TRACK_NAME']");
  const title=q("[data-test-id='VIBE_PLAYERBAR_TRACK_NAME'] > :not([aria-hidden='true'])","[data-test-id='TRACK_TITLE']","a[href*='/track/']")||titleRoot;
  const artist=q("[data-test-id='SEPARATED_ARTIST_TITLE']","[class*='PlayerBarTitle_artist']");
  const cover=q("[data-test-id='VIBE_ALBUM_COVER'] img","img[data-test-id='ENTITY_COVER_IMAGE']","[class*='PlayerBarDesktop_cover'] img");
  const like=q("[data-test-id='LIKE_BUTTON']");
  const dislike=q("[data-test-id='DISLIKE_BUTTON']");
  const now=q("[data-test-id='TIMECODE_TIME_START']");
  const end=q("[data-test-id='TIMECODE_TIME_END']");
  const timecode=q("[data-test-id='VIBE_PLAYERBAR_TIMECODE']");
  const timeParts=text(timecode).split('/').map(x=>x.trim());
  const slider=q("[data-test-id='VIBE_PLAYERBAR_TIMECODE_SLIDER'] input[type='range']","input[data-test-id='TIMECODE_SLIDER']");
  const position=Number(slider?.value)||sec(text(now))||sec(timeParts[0]);
  const duration=Number(slider?.max)||sec(text(end))||sec(timeParts[1]);
  const active=(e) => {
    if(!e) return false;
    const pressed=e.getAttribute('aria-pressed');
    if(pressed!==null) return pressed==='true';
    const cls=String(e.className||'').toLowerCase();
    const href=String(e.querySelector('use')?.getAttribute('href')||e.querySelector('use')?.getAttribute('xlink:href')||'').toLowerCase();
    return cls.includes('active')||cls.includes('checked')||href.includes('filled')||href.includes('liked');
  };
  return {
    ready: !!play,
    title:text(title),
    artist:text(artist),
    cover:cover ? cover.src : '',
    playing:!!document.querySelector("[data-test-id='PAUSE_BUTTON']"),
    position,
    duration,
    canNext:!!q("[data-test-id='NEXT_TRACK_BUTTON']"),
    canPrev:!!q("[data-test-id='PREVIOUS_TRACK_BUTTON']"),
    canLike:!!like,
    canDislike:!!dislike,
    liked:active(like),
    disliked:active(dislike)
  };
})()
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reserves_ephemeral_loopback_port() {
        let port = reserve_local_port().expect("port");
        assert_ne!(port, 0);
        assert_ne!(port, 9_222);
    }

    #[test]
    fn commands_are_built_from_fixed_selectors() {
        let expression = click_expression(&["NEXT_TRACK_BUTTON"]);
        assert!(expression.contains("data-test-id='NEXT_TRACK_BUTTON'"));
        assert!(!expression.contains("eval("));
    }

    #[test]
    fn seek_is_clamped_to_non_negative_time() {
        let expression = seek_expression(-100);
        assert!(expression.contains("Math.min(0"));
    }

    #[test]
    fn discovers_renderer_over_plain_loopback_http() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).expect("listener");
        let port = listener.local_addr().expect("address").port();
        let (release_server, wait_for_client) = std::sync::mpsc::channel();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut request = [0_u8; 512];
            let _ = stream.read(&mut request);
            let body = r#"[{"type":"page","title":"Яндекс Музыка","url":"music-application://desktop/","webSocketDebuggerUrl":"ws://127.0.0.1:9999/devtools/page/1"}]"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("response");
            wait_for_client.recv().expect("client completion");
        });
        let targets = discover_targets_blocking(port).expect("targets");
        release_server.send(()).expect("release server");
        server.join().expect("server");
        assert_eq!(targets.len(), 1);
        assert_eq!(targets[0].url, "music-application://desktop/");
    }

    #[test]
    fn rejects_non_music_targets_and_non_loopback_websockets() {
        let target = DebugTarget {
            kind: "page".into(),
            url: "https://example.invalid/".into(),
            web_socket_debugger_url: "ws://example.invalid/devtools/page/1".into(),
        };
        assert!(!is_valid_target(&target));
        assert!(!websocket_matches_endpoint(
            9_222,
            &target.web_socket_debugger_url
        ));
    }

    #[test]
    fn reuses_one_websocket_for_multiple_evaluations() {
        tokio::runtime::Runtime::new()
            .expect("runtime")
            .block_on(async {
                use tokio::io::{AsyncReadExt, AsyncWriteExt};

                *actor_lock().lock().await = None;
                let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
                    .await
                    .expect("listener");
                let port = listener.local_addr().expect("address").port();
                let server = tokio::spawn(async move {
                    let (mut discovery, _) =
                        listener.accept().await.expect("discovery connection");
                    let mut request = [0_u8; 1024];
                    discovery
                        .read(&mut request)
                        .await
                        .expect("discovery request");
                    let body = format!(
                        r#"[{{"type":"page","url":"music-application://desktop/","webSocketDebuggerUrl":"ws://127.0.0.1:{port}/devtools/page/1"}}]"#
                    );
                    discovery
                        .write_all(
                            format!(
                                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                body.len(),
                                body
                            )
                            .as_bytes(),
                        )
                        .await
                        .expect("discovery response");
                    drop(discovery);

                    let (stream, _) = listener.accept().await.expect("websocket connection");
                    let mut socket = tokio_tungstenite::accept_async(stream)
                        .await
                        .expect("websocket handshake");
                    for value in [41, 42] {
                        let message = socket
                            .next()
                            .await
                            .expect("request")
                            .expect("valid request");
                        let Message::Text(text) = message else {
                            panic!("expected text request")
                        };
                        let request: Value =
                            serde_json::from_str(&text).expect("request json");
                        let id = request
                            .get("id")
                            .and_then(Value::as_u64)
                            .expect("request id");
                        socket
                            .send(Message::Text(
                                json!({"id": id, "result": {"result": {"value": value}}})
                                    .to_string()
                                    .into(),
                            ))
                            .await
                            .expect("reply");
                    }
                });

                let discoveries_before = DISCOVERIES.load(Ordering::Relaxed);
                let connects_before = WEBSOCKET_CONNECTS.load(Ordering::Relaxed);
                assert_eq!(evaluate(port, "41").await.expect("first evaluation"), 41);
                assert_eq!(evaluate(port, "42").await.expect("second evaluation"), 42);
                assert_eq!(
                    DISCOVERIES.load(Ordering::Relaxed) - discoveries_before,
                    1
                );
                assert_eq!(
                    WEBSOCKET_CONNECTS.load(Ordering::Relaxed) - connects_before,
                    1
                );
                server.await.expect("server");
                *actor_lock().lock().await = None;
            });
    }
}
