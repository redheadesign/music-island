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

use crate::media::{
    health, MediaCommand, MediaProvider, MediaSnapshot, PlaybackStatus, RepeatMode,
};

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WavePreset {
    pub id: String,
    pub title: String,
    pub icon_url: Option<String>,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WaveCatalogResult {
    pub supported: bool,
    pub presets: Vec<WavePreset>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WaveSelectionResult {
    pub supported: bool,
    pub applied: bool,
    pub active_wave_id: Option<String>,
    pub message: Option<String>,
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
        average_rpc_rtt_ms: RPC_RTT_TOTAL_MS
            .load(Ordering::Relaxed)
            .checked_div(evaluations)
            .unwrap_or(0),
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

#[derive(Clone)]
struct DirectMetadata {
    track_id: Option<String>,
    title: Option<String>,
    artist: Option<String>,
    cover: Option<String>,
}

fn metadata_lock() -> &'static RwLock<Option<DirectMetadata>> {
    static METADATA: OnceLock<RwLock<Option<DirectMetadata>>> = OnceLock::new();
    METADATA.get_or_init(|| RwLock::new(None))
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

const SOFT_RECOVER_MIN_INTERVAL: Duration = Duration::from_secs(20);
const SOFT_RECOVER_FAILURE_THRESHOLD: u32 = 3;
const RESTART_REQUIRED_FAILURE_THRESHOLD: u32 = 8;

fn last_soft_recover_at() -> &'static RwLock<Option<Instant>> {
    static LAST: OnceLock<RwLock<Option<Instant>>> = OnceLock::new();
    LAST.get_or_init(|| RwLock::new(None))
}

/// Soft recovery for long downtime: rediscover a debug-enabled client and reattach.
/// Does **not** kill/relaunch Yandex Music — that stays behind explicit Quick reload / Settings.
pub async fn try_soft_recover() -> Option<DirectYandexStatus> {
    let failures = PROBE_FAILURES.load(Ordering::Relaxed);
    if failures < SOFT_RECOVER_FAILURE_THRESHOLD {
        return None;
    }

    let current = status();
    if !matches!(
        current.state,
        DirectYandexState::Connected
            | DirectYandexState::Degraded
            | DirectYandexState::RestartRequired
            | DirectYandexState::Connecting
    ) {
        return None;
    }

    {
        let last = last_soft_recover_at()
            .read()
            .expect("soft recover timestamp lock poisoned");
        if let Some(at) = *last {
            if at.elapsed() < SOFT_RECOVER_MIN_INTERVAL {
                return None;
            }
        }
    }
    *last_soft_recover_at()
        .write()
        .expect("soft recover timestamp lock poisoned") = Some(Instant::now());

    crate::logging::append_event(&format!(
        "direct Yandex soft recover attempted after {failures} probe failures"
    ));

    let Some((port, executable)) = find_running_debug_endpoint() else {
        if failures >= RESTART_REQUIRED_FAILURE_THRESHOLD
            && matches!(
                current.state,
                DirectYandexState::Connected | DirectYandexState::Degraded
            )
        {
            set_status(DirectYandexStatus {
                state: DirectYandexState::RestartRequired,
                message:
                    "Direct endpoint is not running. Use Quick reload or reconnect in Settings."
                        .into(),
                port: current.port,
                executable_path: current
                    .executable_path
                    .or_else(|| find_executable().map(|path| path.to_string_lossy().into_owned())),
            });
            return Some(status());
        }
        return None;
    };

    *actor_lock().lock().await = None;
    match attach_existing(port, executable).await {
        Ok(next) => {
            crate::logging::append_event(&format!(
                "direct Yandex soft recover succeeded on port={port}"
            ));
            Some(next)
        }
        Err(error) => {
            crate::logging::append_event(&format!(
                "direct Yandex soft recover attach failed: {error:#}"
            ));
            if failures >= RESTART_REQUIRED_FAILURE_THRESHOLD {
                set_status(DirectYandexStatus {
                    state: DirectYandexState::RestartRequired,
                    message: format!(
                        "Existing endpoint was rejected ({error:#}). Use Quick reload or reconnect in Settings."
                    ),
                    port: Some(port),
                    executable_path: current.executable_path,
                });
                return Some(status());
            }
            None
        }
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
    *metadata_lock()
        .write()
        .expect("Yandex metadata lock poisoned") = None;
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
    let controls_ready = value.get("ready").and_then(Value::as_bool) == Some(true);
    let metadata_ready = value.get("metadataReady").and_then(Value::as_bool) == Some(true);
    if !controls_ready && !metadata_ready {
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
    let track_id = validated_dom_id(string_field(&value, "trackId"));
    let mut title = string_field(&value, "title").and_then(collapse_repeated_title);
    let mut artist = string_field(&value, "artist").and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    });
    let mut cover = string_field(&value, "cover").and_then(|value| {
        if value.trim().is_empty() {
            None
        } else {
            Some(value)
        }
    });
    {
        let previous = metadata_lock()
            .read()
            .expect("Yandex metadata lock poisoned")
            .clone();
        let same_track_id = match (
            &track_id,
            previous.as_ref().and_then(|item| item.track_id.as_ref()),
        ) {
            (Some(current), Some(prior)) => current == prior,
            _ => false,
        };
        let same_title = match (
            &title,
            previous.as_ref().and_then(|item| item.title.as_ref()),
        ) {
            (Some(current), Some(prior)) => current == prior,
            _ => false,
        };
        // Prefer track id; fall back to title only when DOM has no stable id yet.
        let same_track = same_track_id || (track_id.is_none() && same_title);
        if same_track {
            title = title.or_else(|| previous.as_ref().and_then(|item| item.title.clone()));
            artist = artist.or_else(|| previous.as_ref().and_then(|item| item.artist.clone()));
            cover = cover.or_else(|| previous.as_ref().and_then(|item| item.cover.clone()));
        }
        if title.is_some() || track_id.is_some() {
            *metadata_lock()
                .write()
                .expect("Yandex metadata lock poisoned") = Some(DirectMetadata {
                track_id: track_id.clone(),
                title: title.clone(),
                artist: artist.clone(),
                cover: cover.clone(),
            });
        }
    }
    Ok(MediaSnapshot {
        generation: 0,
        has_session: title.is_some() || track_id.is_some() || controls_ready,
        source_app_id: Some("YandexMusic.Direct".into()),
        track_id,
        title,
        artist,
        album_title: None,
        playback_status: if value.get("playing").and_then(Value::as_bool) == Some(true) {
            PlaybackStatus::Playing
        } else {
            PlaybackStatus::Paused
        },
        position_ms,
        duration_ms,
        can_seek: controls_ready && duration_ms.unwrap_or(0) > 0,
        can_go_next: controls_ready
            && value
                .get("canNext")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        can_go_previous: controls_ready
            && value
                .get("canPrev")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        can_play: controls_ready,
        can_pause: controls_ready,
        can_like: controls_ready
            && value
                .get("canLike")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        can_dislike: controls_ready
            && value
                .get("canDislike")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        is_liked: value.get("liked").and_then(Value::as_bool).unwrap_or(false),
        is_disliked: value
            .get("disliked")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        can_shuffle: controls_ready
            && value
                .get("canShuffle")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        is_shuffle_active: value
            .get("shuffleActive")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        can_repeat: controls_ready
            && value
                .get("canRepeat")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        repeat_mode: match value.get("repeatMode").and_then(Value::as_str) {
            Some("one") => RepeatMode::One,
            Some("all") => RepeatMode::All,
            _ => RepeatMode::Off,
        },
        active_wave_id: validated_dom_id(string_field(&value, "activeWaveId")),
        active_wave_title: string_field(&value, "activeWaveTitle"),
        thumbnail_data_url: cover,
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
    let before = if matches!(
        &command,
        MediaCommand::Play
            | MediaCommand::Pause
            | MediaCommand::PlayPause
            | MediaCommand::Stop
            | MediaCommand::Like
            | MediaCommand::Dislike
            | MediaCommand::ToggleShuffle
            | MediaCommand::CycleRepeat
    ) {
        Some(evaluate(port, STATE_EXPRESSION).await?)
    } else {
        None
    };
    if let Some(state) = before.as_ref() {
        let supported = match &command {
            MediaCommand::ToggleShuffle => state
                .get("canShuffle")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            MediaCommand::CycleRepeat => state
                .get("canRepeat")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            _ => true,
        };
        if !supported {
            anyhow::bail!("Yandex Music does not expose this control");
        }
    }
    let expression = match &command {
        MediaCommand::Play => playback_click_expression("PLAY_BUTTON"),
        MediaCommand::Pause | MediaCommand::Stop => playback_click_expression("PAUSE_BUTTON"),
        MediaCommand::PlayPause => play_pause_click_expression(),
        MediaCommand::Next => click_expression(&["NEXT_TRACK_BUTTON"]),
        MediaCommand::Previous => click_expression(&["PREVIOUS_TRACK_BUTTON"]),
        MediaCommand::Like => click_expression(&["LIKE_BUTTON"]),
        MediaCommand::Dislike => click_expression(&["DISLIKE_BUTTON"]),
        MediaCommand::ToggleShuffle => click_expression(&["SHUFFLE_BUTTON_ON", "SHUFFLE_BUTTON"]),
        MediaCommand::CycleRepeat => click_expression(&[
            "REPEAT_BUTTON_NO_REPEAT",
            "REPEAT_BUTTON_REPEAT_CONTEXT",
            "REPEAT_BUTTON_REPEAT_ONE",
        ]),
        MediaCommand::Seek { position_ms } => seek_expression(*position_ms),
    };
    let result = evaluate(port, &expression).await?;
    if result.as_bool() != Some(true) {
        crate::logging::append_event("direct Yandex command was rejected by renderer");
        anyhow::bail!("Yandex Music rejected the direct command");
    }
    if let Some(before) = before {
        confirm_command(port, &command, &before).await?;
    }
    Ok(())
}

pub async fn wave_presets() -> anyhow::Result<WaveCatalogResult> {
    let port = direct_port()?;
    let value = evaluate(port, WAVE_CATALOG_EXPRESSION).await?;
    let mut result: WaveCatalogResult = serde_json::from_value(value)
        .map_err(|error| anyhow::anyhow!("invalid wave catalog response: {error}"))?;
    result.presets.retain(|preset| valid_dom_id(&preset.id));
    if result.supported && result.presets.is_empty() {
        result.message = Some("Wave preset controls were found, but expose no stable IDs".into());
    }
    Ok(result)
}

pub async fn select_wave_preset(id: &str) -> anyhow::Result<WaveSelectionResult> {
    validate_dom_id(id)?;
    let port = direct_port()?;
    let quoted_id = serde_json::to_string(id)?;
    let expression = format!(
        "(() => {{ const id={quoted_id}; const nodes=[...document.querySelectorAll(\"[data-test-id='WHEEL_VIBE_ITEM']\")]; const e=nodes.find(x=>String(x.getAttribute('data-intersection-property-id')||'')===id); if(!e)return {{supported:nodes.length>0,applied:false,activeWaveId:null,message:nodes.length?'Wave preset ID is unavailable':'Wave preset selection is unsupported by this client version'}}; const button=e.querySelector(\"[data-test-id='PLAY_BUTTON']\")||e.closest('button'); if(!button)return {{supported:true,applied:false,activeWaveId:null,message:'Wave preset play control is unavailable'}}; button.click(); return {{supported:true,applied:true,activeWaveId:id,message:null}}; }})()"
    );
    parse_wave_selection(evaluate(port, &expression).await?)
}

pub async fn clear_wave_selection() -> anyhow::Result<WaveSelectionResult> {
    let port = direct_port()?;
    parse_wave_selection(evaluate(port, WAVE_CLEAR_EXPRESSION).await?)
}

fn direct_port() -> anyhow::Result<u16> {
    status()
        .port
        .ok_or_else(|| anyhow::anyhow!("direct Yandex connection is disabled"))
}

fn parse_wave_selection(value: Value) -> anyhow::Result<WaveSelectionResult> {
    let mut result: WaveSelectionResult = serde_json::from_value(value)
        .map_err(|error| anyhow::anyhow!("invalid wave selection response: {error}"))?;
    result.active_wave_id = validated_dom_id(result.active_wave_id);
    Ok(result)
}

fn valid_dom_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b':' | b'.'))
}

fn validate_dom_id(id: &str) -> anyhow::Result<()> {
    if valid_dom_id(id) {
        Ok(())
    } else {
        anyhow::bail!("invalid wave preset ID")
    }
}

fn validated_dom_id(id: Option<String>) -> Option<String> {
    id.filter(|value| valid_dom_id(value))
}

async fn confirm_command(port: u16, command: &MediaCommand, before: &Value) -> anyhow::Result<()> {
    let confirmed = |after: &Value| match command {
        MediaCommand::Play => after.get("playing").and_then(Value::as_bool) == Some(true),
        MediaCommand::Pause | MediaCommand::Stop => {
            after.get("playing").and_then(Value::as_bool) == Some(false)
        }
        MediaCommand::PlayPause => {
            after.get("playing").and_then(Value::as_bool)
                != before.get("playing").and_then(Value::as_bool)
        }
        MediaCommand::Like => {
            after.get("liked").and_then(Value::as_bool)
                != before.get("liked").and_then(Value::as_bool)
        }
        MediaCommand::Dislike => {
            after.get("disliked").and_then(Value::as_bool)
                != before.get("disliked").and_then(Value::as_bool)
        }
        MediaCommand::ToggleShuffle => {
            after.get("shuffleActive").and_then(Value::as_bool)
                != before.get("shuffleActive").and_then(Value::as_bool)
        }
        MediaCommand::CycleRepeat => {
            after.get("repeatMode").and_then(Value::as_str)
                != before.get("repeatMode").and_then(Value::as_str)
        }
        _ => true,
    };
    for _ in 0..4 {
        sleep(Duration::from_millis(125)).await;
        if confirmed(&evaluate(port, STATE_EXPRESSION).await?) {
            return Ok(());
        }
    }
    anyhow::bail!("Yandex Music did not confirm the direct command")
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

/// Collapse accidental DOM concatenations like "TitleTitle" / "TitleTitleTitle".
fn collapse_repeated_title(title: String) -> Option<String> {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return None;
    }
    let chars: Vec<char> = trimmed.chars().collect();
    for n in 2..=4 {
        if chars.len() % n != 0 {
            continue;
        }
        let chunk_len = chars.len() / n;
        if chunk_len == 0 {
            continue;
        }
        let chunk: String = chars[..chunk_len].iter().collect();
        if chunk
            .chars()
            .cycle()
            .take(chars.len())
            .eq(chars.iter().copied())
        {
            let collapsed = chunk.trim();
            if !collapsed.is_empty() {
                return Some(collapsed.to_string());
            }
        }
    }
    Some(trimmed.to_string())
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
        "direct Yandex capabilities: next={}, previous={}, seek={}, like={}, dislike={}, shuffle={}, repeat={}",
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
        value
            .get("canShuffle")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        value
            .get("canRepeat")
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
        "(() => {{ const root=document.querySelector(\"[data-test-id='VIBE_PLAYERBAR']\")||document.querySelector(\"[data-test-id='PLAYER_BAR']\")||document.querySelector(\"[class*='PlayerBarDesktopWithBackgroundProgressBar']\")||document.querySelector(\"[class*='PlayerBarDesktop']\")||document.querySelector(\"[data-test-id='VIBE_PLAYERBAR_TRACK_NAME']\")?.closest('footer,section,div'); if(!root)return false; for (const s of [{selectors}]) {{ const e=root.querySelector(s); if(e){{(e.closest('button')||e).click();return true;}} }} return false; }})()"
    )
}

fn playback_click_expression(id: &str) -> String {
    click_expression(&[id])
}

fn play_pause_click_expression() -> String {
    click_expression(&["PAUSE_BUTTON", "PLAY_BUTTON"])
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
  const findRoot = () => {
    const explicit=q(
      "[data-test-id='VIBE_PLAYERBAR']",
      "[data-test-id='PLAYER_BAR']",
      "[class*='PlayerBarDesktopWithBackgroundProgressBar']",
      "[class*='PlayerBarDesktop_root']",
      "[class*='PlayerBarDesktop']",
      "[class*='PlayerBarMobile']"
    );
    if(explicit) return explicit;
    const titleAnchor=q("[data-test-id='VIBE_PLAYERBAR_TRACK_NAME']","[data-test-id='TRACK_TITLE']","a[href*='/track/']");
    const fromTitle=titleAnchor?.closest('footer,section,[class*="PlayerBar"],div');
    if(fromTitle && (fromTitle.querySelector("[data-test-id='PAUSE_BUTTON'],[data-test-id='PLAY_BUTTON']") || fromTitle.querySelector("a[href*='/track/']"))) {
      return fromTitle;
    }
    const control=q("[data-test-id='PAUSE_BUTTON']","[data-test-id='PLAY_BUTTON']");
    return control?.closest('footer,section,[class*="PlayerBar"],div')||null;
  };
  const root=findRoot();
  const pq = (...s) => { if(!root)return null; for(const x of s){const e=root.querySelector(x);if(e)return e;}return null; };
  const dedupeTitle = (value) => {
    const t = String(value||'').replace(/\s+/g,' ').trim();
    if (t.length < 2) return t;
    for (let n = 2; n <= 4; n += 1) {
      if (t.length % n !== 0) continue;
      const chunk = t.slice(0, t.length / n);
      if (chunk && chunk.repeat(n) === t) return chunk.trim();
    }
    return t;
  };
  const play=pq("[data-test-id='PAUSE_BUTTON']","[data-test-id='PLAY_BUTTON']");
  const titleRoot=pq("[data-test-id='VIBE_PLAYERBAR_TRACK_NAME']","[class*='PlayerBarTitle_root']","[class*='PlayerBarDesktop_title']");
  const stableTitle=titleRoot?.querySelector(":scope > [aria-hidden='true']");
  const titleLeaf=pq("[data-test-id='TRACK_TITLE']","a[href*='/track/']","[class*='PlayerBarTitle_title']","[class*='TrackName']")||stableTitle||null;
  const title=titleLeaf||titleRoot;
  const trackLink=pq("a[href*='/track/']");
  const trackId=trackLink?.getAttribute('href')?.match(/\/track\/([A-Za-z0-9_.:-]+)/)?.[1]||titleRoot?.getAttribute('data-track-id')||'';
  const artistScope = root || document;
  const artistPrimary=[...artistScope.querySelectorAll(
    "[data-test-id='SEPARATED_ARTIST_TITLE'],a[href*='/artist/']"
  )].filter((e)=>e!==titleLeaf && !(titleLeaf&&titleLeaf.contains(e)));
  const artistFallback=artistPrimary.length ? [] : [...artistScope.querySelectorAll(
    "[class*='PlayerBarTitle_artist'],[class*='SeparatedArtists'] a,[class*='SeparatedArtists'],[data-test-id='VIBE_PLAYERBAR_TRACK_NAME'] [class*='artists'] a"
  )].filter((e)=>e!==titleLeaf && !(titleLeaf&&titleLeaf.contains(e)));
  let artistText=[...new Set([...artistPrimary,...artistFallback].map((e)=>text(e).replace(/\s*[—–-]\s*$/,'').trim()).filter(Boolean))].join(', ');
  let titleText=(()=>{
    if(!title)return '';
    // Prefer a single leaf: Yandex often mounts visible + aria-hidden copies under one parent.
    const node = titleLeaf || stableTitle || title;
    const copy=node.cloneNode(true);
    copy.querySelectorAll("[class*='artists'],[data-test-id='SEPARATED_ARTIST_TITLE'],a[href*='/artist/'],[class*='PlayerBarTitle_artist'],[class*='SeparatedArtists']").forEach(e=>e.remove());
    const directHidden=copy.querySelector(':scope > [aria-hidden="true"]');
    if(directHidden && copy.children.length>1){
      return dedupeTitle(text(directHidden));
    }
    return dedupeTitle(text(copy));
  })();
  if(!artistText && titleText){
    const split=titleText.split(/\s+[—–-]\s+/);
    if(split.length>=2){
      artistText=split[0].trim();
      titleText=dedupeTitle(split.slice(1).join(' — ').trim());
    }
  }
  titleText=dedupeTitle(titleText);
  const cover=pq(
    "[data-test-id='VIBE_ALBUM_COVER'] img",
    "img[data-test-id='ENTITY_COVER_IMAGE']",
    "[class*='PlayerBarDesktop_cover'] img",
    "[class*='PlayerBarDesktopWithBackgroundProgressBar'] img",
    "img[src*='avatars.yandex.net']"
  );
  const like=pq("[data-test-id='LIKE_BUTTON']","button[aria-label*='рав'],button[aria-label*='ike']");
  const dislike=pq("[data-test-id='DISLIKE_BUTTON']","button[aria-label*='е нрав'],button[aria-label*='islike']");
  const shuffleOn=pq("[data-test-id='SHUFFLE_BUTTON_ON']");
  const shuffle=shuffleOn||pq("[data-test-id='SHUFFLE_BUTTON']");
  const repeatOne=pq("[data-test-id='REPEAT_BUTTON_REPEAT_ONE']");
  const repeatAll=pq("[data-test-id='REPEAT_BUTTON_REPEAT_CONTEXT']");
  const repeat=repeatOne||repeatAll||pq("[data-test-id='REPEAT_BUTTON_NO_REPEAT']");
  const available=(e)=>{
    const button=e?.closest('button')||e;
    return !!button && !button.disabled && button.getAttribute('aria-disabled')!=='true';
  };
  const now=pq("[data-test-id='TIMECODE_TIME_START']");
  const end=pq("[data-test-id='TIMECODE_TIME_END']");
  const timecode=pq("[data-test-id='VIBE_PLAYERBAR_TIMECODE']");
  const timeParts=text(timecode).split('/').map(x=>x.trim());
  const slider=pq("[data-test-id='VIBE_PLAYERBAR_TIMECODE_SLIDER'] input[type='range']","input[data-test-id='TIMECODE_SLIDER']","input[type='range']");
  const position=Number(slider?.value)||sec(text(now))||sec(timeParts[0]);
  const duration=Number(slider?.max)||sec(text(end))||sec(timeParts[1]);
  const active=(e, kind) => {
    if(!e) return false;
    const pressed=e.getAttribute('aria-pressed');
    if(pressed!==null) return pressed==='true';
    if(['active','checked','on','selected'].includes(String(e.getAttribute('data-state')||'').toLowerCase())) return true;
    const classes=String(e.className||'').toLowerCase().split(/\s+/).filter(Boolean);
    if(classes.some(x=>['active','checked','selected',kind==='like'?'liked':'disliked'].includes(x))) return true;
    const href=String(e.querySelector('use')?.getAttribute('href')||e.querySelector('use')?.getAttribute('xlink:href')||'').toLowerCase();
    const icon=href.split(/[\/#]/).filter(Boolean).pop()||'';
    const icons=kind==='like'?['liked','like-filled','heart-filled','favorite-filled']:['disliked','dislike-filled','thumb-down-filled'];
    return icons.includes(icon);
  };
  const activeWave=document.querySelector("[data-test-id='RESET_VIBE_CONTEXT_BUTTON']");
  const activeWaveTitle=text(activeWave);
  const activeWheelItem=[...document.querySelectorAll("[data-test-id='WHEEL_VIBE_ITEM']")]
    .find(e=>text(e)===activeWaveTitle);
  const hasMeta=!!(titleText || trackId || (cover && cover.src));
  return {
    ready: !!play,
    metadataReady: hasMeta,
    trackId,
    title:titleText,
    artist:artistText,
    cover:cover ? cover.src : '',
    playing:!!pq("[data-test-id='PAUSE_BUTTON']"),
    position,
    duration,
    canNext:!!pq("[data-test-id='NEXT_TRACK_BUTTON']"),
    canPrev:!!pq("[data-test-id='PREVIOUS_TRACK_BUTTON']"),
    canLike:!!like,
    canDislike:!!dislike,
    liked:active(like,'like'),
    disliked:active(dislike,'dislike'),
    canShuffle:available(shuffle),
    shuffleActive:!!shuffleOn && available(shuffleOn),
    canRepeat:available(repeat),
    repeatMode:repeatOne?'one':repeatAll?'all':'off',
    activeWaveId:activeWheelItem?.getAttribute('data-intersection-property-id')||'',
    activeWaveTitle
  };
})()
"#;

const WAVE_CATALOG_EXPRESSION: &str = r#"
(() => {
  const nodes=[...document.querySelectorAll("[data-test-id='WHEEL_VIBE_ITEM']")];
  if(!nodes.length)return {supported:false,presets:[],message:"Wave preset selection is unsupported by this client version"};
  const activeTitle=String(document.querySelector("[data-test-id='RESET_VIBE_CONTEXT_BUTTON']")?.textContent||'').trim();
  const presets=nodes.map(e=>{
    const id=e.getAttribute('data-intersection-property-id')||'';
    const title=String(e.textContent||e.getAttribute('aria-label')||'').trim();
    const iconUrl=e.querySelector("img[data-test-id='ENTITY_COVER_IMAGE']")?.src||null;
    return {id,title,iconUrl,isActive:title===activeTitle};
  }).filter(x=>x.id);
  return {supported:true,presets:[...new Map(presets.map(x=>[x.title,x])).values()],message:null};
})()
"#;

const WAVE_CLEAR_EXPRESSION: &str = r#"
(() => {
  const e=document.querySelector("[data-test-id='RESET_VIBE_CONTEXT_BUTTON']");
  if(!e)return {supported:false,applied:false,activeWaveId:null,message:"Clearing wave selection is unsupported by this client version"};
  (e.closest('button')||e).click();
  return {supported:true,applied:true,activeWaveId:null,message:null};
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
        assert!(expression.contains("VIBE_PLAYERBAR"));
        assert!(!expression.contains("eval("));
    }

    #[test]
    fn playback_commands_use_distinct_player_bar_selectors() {
        let play = playback_click_expression("PLAY_BUTTON");
        let pause = playback_click_expression("PAUSE_BUTTON");
        assert!(play.contains("PLAY_BUTTON"));
        assert!(!play.contains("PAUSE_BUTTON"));
        assert!(pause.contains("PAUSE_BUTTON"));
        assert!(!pause.contains("\"[data-test-id='PLAY_BUTTON']\""));
        let toggle = play_pause_click_expression();
        assert!(toggle.contains("PAUSE_BUTTON"));
        assert!(toggle.contains("PLAY_BUTTON"));
    }

    #[test]
    fn reaction_detection_uses_exact_tokens() {
        assert!(!STATE_EXPRESSION.contains("href.includes('liked')"));
        assert!(!STATE_EXPRESSION.contains("href.includes('disliked')"));
        assert!(STATE_EXPRESSION.contains("icons.includes(icon)"));
        assert!(STATE_EXPRESSION.contains("aria-pressed"));
    }

    #[test]
    fn shuffle_and_repeat_use_verified_player_test_ids() {
        for id in [
            "SHUFFLE_BUTTON",
            "SHUFFLE_BUTTON_ON",
            "REPEAT_BUTTON_NO_REPEAT",
            "REPEAT_BUTTON_REPEAT_CONTEXT",
            "REPEAT_BUTTON_REPEAT_ONE",
        ] {
            assert!(STATE_EXPRESSION.contains(id));
        }
        assert!(STATE_EXPRESSION.contains("repeatMode:repeatOne?'one':repeatAll?'all':'off'"));
        assert!(STATE_EXPRESSION.contains("button.getAttribute('aria-disabled')!=='true'"));
        let repeat = click_expression(&[
            "REPEAT_BUTTON_NO_REPEAT",
            "REPEAT_BUTTON_REPEAT_CONTEXT",
            "REPEAT_BUTTON_REPEAT_ONE",
        ]);
        assert!(repeat.contains("REPEAT_BUTTON_REPEAT_ONE"));
        assert!(!repeat.contains("eval("));
    }

    #[test]
    fn state_expression_rediscovers_desktop_player_layouts() {
        assert!(STATE_EXPRESSION.contains("PlayerBarDesktopWithBackgroundProgressBar"));
        assert!(STATE_EXPRESSION.contains("metadataReady"));
        assert!(STATE_EXPRESSION.contains("split(/\\s+[—–-]\\s+/)"));
        assert!(STATE_EXPRESSION.contains("dedupeTitle"));
        assert!(click_expression(&["PLAY_BUTTON"]).contains("PlayerBarDesktop"));
    }

    #[test]
    fn collapses_concatenated_track_titles() {
        assert_eq!(
            collapse_repeated_title("Эмо хардкорЭмо хардкор".into()).as_deref(),
            Some("Эмо хардкор")
        );
        assert_eq!(
            collapse_repeated_title("TrackTrackTrack".into()).as_deref(),
            Some("Track")
        );
        assert_eq!(
            collapse_repeated_title("Normal Title".into()).as_deref(),
            Some("Normal Title")
        );
    }

    #[test]
    fn wave_ids_reject_script_and_selector_injection() {
        for valid in ["daily-mix", "wave_1", "genre:rock", "preset.2"] {
            assert!(validate_dom_id(valid).is_ok());
        }
        for invalid in ["", "a'b", "x] button", "wave;alert(1)", "пресет"] {
            assert!(validate_dom_id(invalid).is_err());
        }
    }

    #[test]
    fn wave_expressions_are_rust_owned_and_report_unsupported() {
        assert!(WAVE_CATALOG_EXPRESSION.contains("supported:false"));
        assert!(WAVE_CLEAR_EXPRESSION.contains("supported:false"));
        assert!(!WAVE_CATALOG_EXPRESSION.contains("eval("));
        assert!(!WAVE_CLEAR_EXPRESSION.contains("eval("));
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
                    let request_size = discovery
                        .read(&mut request)
                        .await
                        .expect("discovery request");
                    assert!(request_size > 0, "empty discovery request");
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
