use crate::config::{ConfigState, PluginsConfig};
use crate::logging;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::{BufRead, BufReader, Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Mutex, OnceLock},
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};

const DEFAULT_IPC_HOST: &str = "127.0.0.1";
const DEFAULT_IPC_PORT: u16 = 38_472;
const IPC_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub icon: Option<String>,
    pub entry_exe: String,
    #[serde(default)]
    pub entry_args: Vec<String>,
    #[serde(default)]
    pub ipc: PluginIpcConfig,
    #[serde(default)]
    pub island: PluginIslandConfig,
    #[serde(default)]
    pub settings: PluginSettingsConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginIpcConfig {
    #[serde(default = "default_ipc_kind")]
    pub kind: String,
    #[serde(default = "default_ipc_host")]
    pub host: String,
    #[serde(default = "default_ipc_port")]
    pub port: u16,
}

fn default_ipc_kind() -> String {
    "tcp".into()
}
fn default_ipc_host() -> String {
    DEFAULT_IPC_HOST.into()
}
fn default_ipc_port() -> u16 {
    DEFAULT_IPC_PORT
}

impl Default for PluginIpcConfig {
    fn default() -> Self {
        Self {
            kind: default_ipc_kind(),
            host: default_ipc_host(),
            port: default_ipc_port(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginIslandConfig {
    #[serde(default = "default_rail_actions")]
    pub rail_actions: Vec<String>,
    #[serde(default = "default_max_buttons")]
    pub max_buttons: u8,
}

fn default_rail_actions() -> Vec<String> {
    vec!["open-settings".into()]
}
fn default_max_buttons() -> u8 {
    2
}

impl Default for PluginIslandConfig {
    fn default() -> Self {
        Self {
            rail_actions: default_rail_actions(),
            max_buttons: default_max_buttons(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginSettingsConfig {
    #[serde(default)]
    pub panel: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredPlugin {
    pub manifest: PluginManifest,
    pub root_dir: String,
    pub entry_path: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PluginRuntimeState {
    Stopped,
    Starting,
    Running,
    Unhealthy,
    Missing,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRuntimeInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub icon: Option<String>,
    pub enabled: bool,
    pub state: PluginRuntimeState,
    pub message: String,
    pub root_dir: String,
    pub entry_path: String,
    pub source: String,
    pub rail_actions: Vec<String>,
    pub settings_panel: Option<String>,
    pub log_path: String,
}

struct PluginProcess {
    child: Child,
}

struct PluginHost {
    discovered: Vec<DiscoveredPlugin>,
    processes: HashMap<String, PluginProcess>,
    runtime: HashMap<String, PluginRuntimeInfo>,
}

impl PluginHost {
    fn new() -> Self {
        Self {
            discovered: Vec::new(),
            processes: HashMap::new(),
            runtime: HashMap::new(),
        }
    }
}

fn host_lock() -> &'static Mutex<PluginHost> {
    static HOST: OnceLock<Mutex<PluginHost>> = OnceLock::new();
    HOST.get_or_init(|| Mutex::new(PluginHost::new()))
}

pub fn app_data_plugins_dir() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("Music Island")
        .join("plugins")
}

pub fn plugin_log_path(id: &str) -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("Music Island")
        .join("logs")
        .join("plugins")
        .join(format!("{id}.log"))
}

fn exe_plugins_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|parent| parent.join("plugins")))
}

pub fn discover_plugins() -> Vec<DiscoveredPlugin> {
    let mut found: HashMap<String, DiscoveredPlugin> = HashMap::new();

    if let Ok(path) = std::env::var("MUSIC_ISLAND_PLUGIN_VOICE") {
        if let Some(plugin) = load_plugin_dir(PathBuf::from(path.trim()), "env") {
            found.insert(plugin.manifest.id.clone(), plugin);
        }
    }

    for root in [app_data_plugins_dir()]
        .into_iter()
        .chain(exe_plugins_dir())
    {
        let source = if root.starts_with(app_data_plugins_dir()) {
            "appdata"
        } else {
            "exe-sibling"
        };
        if let Ok(entries) = fs::read_dir(&root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                if let Some(plugin) = load_plugin_dir(path, source) {
                    found.entry(plugin.manifest.id.clone()).or_insert(plugin);
                }
            }
        }
    }

    let mut list: Vec<_> = found.into_values().collect();
    list.sort_by(|a, b| a.manifest.id.cmp(&b.manifest.id));
    list
}

fn load_plugin_dir(root: PathBuf, source: &str) -> Option<DiscoveredPlugin> {
    let manifest_path = root.join("manifest.json");
    let contents = fs::read_to_string(&manifest_path).ok()?;
    let manifest: PluginManifest = serde_json::from_str(&contents).ok()?;
    if manifest.id.trim().is_empty() || manifest.entry_exe.trim().is_empty() {
        return None;
    }
    let entry_path = root.join(&manifest.entry_exe);
    Some(DiscoveredPlugin {
        manifest,
        root_dir: root.to_string_lossy().into_owned(),
        entry_path: entry_path.to_string_lossy().into_owned(),
        source: source.into(),
    })
}

fn refresh_runtime_locked(host: &mut PluginHost, enabled: &[String]) {
    host.discovered = discover_plugins();
    let mut next_runtime = HashMap::new();
    for plugin in &host.discovered {
        let id = plugin.manifest.id.clone();
        let is_enabled = enabled.iter().any(|item| item == &id);
        let entry_exists = Path::new(&plugin.entry_path).exists();
        let process_alive = host
            .processes
            .get_mut(&id)
            .map(|proc| match proc.child.try_wait() {
                Ok(None) => true,
                Ok(Some(status)) => {
                    logging::append_event(&format!(
                        "plugin {id} exited with status {status:?}"
                    ));
                    false
                }
                Err(error) => {
                    logging::append_event(&format!("plugin {id} wait failed: {error}"));
                    false
                }
            })
            .unwrap_or(false);
        if !process_alive {
            host.processes.remove(&id);
        }

        let (state, message) = if !entry_exists {
            (
                PluginRuntimeState::Missing,
                format!("Entry not found: {}", plugin.entry_path),
            )
        } else if !is_enabled {
            (PluginRuntimeState::Stopped, "Disabled".into())
        } else if process_alive {
            if ipc_ping(&plugin.manifest.ipc).is_ok() {
                (PluginRuntimeState::Running, "Connected".into())
            } else {
                (
                    PluginRuntimeState::Unhealthy,
                    "Process running, IPC not ready".into(),
                )
            }
        } else {
            (PluginRuntimeState::Stopped, "Enabled but not running".into())
        };

        next_runtime.insert(
            id.clone(),
            PluginRuntimeInfo {
                id,
                name: plugin.manifest.name.clone(),
                version: plugin.manifest.version.clone(),
                icon: plugin.manifest.icon.clone(),
                enabled: is_enabled,
                state,
                message,
                root_dir: plugin.root_dir.clone(),
                entry_path: plugin.entry_path.clone(),
                source: plugin.source.clone(),
                rail_actions: plugin.manifest.island.rail_actions.clone(),
                settings_panel: plugin.manifest.settings.panel.clone(),
                log_path: plugin_log_path(&plugin.manifest.id)
                    .to_string_lossy()
                    .into_owned(),
            },
        );
    }
    host.runtime = next_runtime;
}

pub fn list_runtime(enabled: &[String]) -> Vec<PluginRuntimeInfo> {
    let mut host = host_lock().lock().expect("plugin host lock poisoned");
    refresh_runtime_locked(&mut host, enabled);
    let mut list: Vec<_> = host.runtime.values().cloned().collect();
    list.sort_by(|a, b| a.id.cmp(&b.id));
    list
}

pub fn sync_enabled(app: &AppHandle, plugins: &PluginsConfig) -> Vec<PluginRuntimeInfo> {
    let enabled = &plugins.enabled;
    {
        let mut host = host_lock().lock().expect("plugin host lock poisoned");
        refresh_runtime_locked(&mut host, enabled);

        let to_stop: Vec<String> = host
            .processes
            .keys()
            .filter(|id| !enabled.iter().any(|item| item == *id))
            .cloned()
            .collect();
        for id in to_stop {
            stop_plugin_locked(&mut host, &id);
        }

        let discovered = host.discovered.clone();
        for plugin in discovered {
            if !enabled.iter().any(|item| item == &plugin.manifest.id) {
                continue;
            }
            if host.processes.contains_key(&plugin.manifest.id) {
                continue;
            }
            match start_plugin_locked(&mut host, &plugin) {
                Ok(()) => logging::append_event(&format!(
                    "plugin {} started ({})",
                    plugin.manifest.id, plugin.entry_path
                )),
                Err(error) => {
                    logging::append_event(&format!(
                        "plugin {} start failed: {error}",
                        plugin.manifest.id
                    ));
                    if let Some(runtime) = host.runtime.get_mut(&plugin.manifest.id) {
                        runtime.state = PluginRuntimeState::Error;
                        runtime.message = error;
                    }
                }
            }
        }
        refresh_runtime_locked(&mut host, enabled);
    }

    let runtime = list_runtime(enabled);
    let _ = app.emit("plugins:changed", runtime.clone());
    runtime
}

fn start_plugin_locked(host: &mut PluginHost, plugin: &DiscoveredPlugin) -> Result<(), String> {
    let entry = PathBuf::from(&plugin.entry_path);
    if !entry.exists() {
        return Err(format!("missing entry exe: {}", plugin.entry_path));
    }

    let log_path = plugin_log_path(&plugin.manifest.id);
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    append_plugin_log(
        &plugin.manifest.id,
        &format!("starting {}", plugin.entry_path),
    );

    let mut command = Command::new(&entry);
    command
        .current_dir(&plugin.root_dir)
        .args(&plugin.manifest.entry_args)
        .env("MUSIC_ISLAND_SIDECAR", "1")
        .env(
            "MUSIC_ISLAND_PLUGIN_IPC_PORT",
            plugin.manifest.ipc.port.to_string(),
        )
        .env("MUSIC_ISLAND_PLUGIN_IPC_HOST", &plugin.manifest.ipc.host)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        // Keep window creation for UI sidecars; only hide console flash.
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("spawn failed: {error}"))?;

    if let Some(stdout) = child.stdout.take() {
        tee_plugin_output(plugin.manifest.id.clone(), stdout, "stdout");
    }
    if let Some(stderr) = child.stderr.take() {
        tee_plugin_output(plugin.manifest.id.clone(), stderr, "stderr");
    }

    host.processes.insert(
        plugin.manifest.id.clone(),
        PluginProcess { child },
    );
    if let Some(runtime) = host.runtime.get_mut(&plugin.manifest.id) {
        runtime.state = PluginRuntimeState::Starting;
        runtime.message = "Starting…".into();
    }
    Ok(())
}

fn stop_plugin_locked(host: &mut PluginHost, id: &str) {
    if let Some(mut proc) = host.processes.remove(id) {
        let _ = proc.child.kill();
        let _ = proc.child.wait();
        append_plugin_log(id, "stopped");
        logging::append_event(&format!("plugin {id} stopped"));
    }
    if let Some(runtime) = host.runtime.get_mut(id) {
        runtime.state = PluginRuntimeState::Stopped;
        runtime.message = "Disabled".into();
        runtime.enabled = false;
    }
}

fn tee_plugin_output<R: Read + Send + 'static>(id: String, reader: R, stream: &'static str) {
    thread::spawn(move || {
        let buffered = BufReader::new(reader);
        for line in buffered.lines().flatten() {
            append_plugin_log(&id, &format!("[{stream}] {line}"));
        }
    });
}

pub fn append_plugin_log(id: &str, message: &str) {
    let path = plugin_log_path(id);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(
            file,
            "{} {message}",
            chrono::Utc::now().to_rfc3339()
        );
    }
}

fn ipc_ping(ipc: &PluginIpcConfig) -> Result<(), String> {
    let _ = ipc_call(ipc, "ping", json!({}))?;
    Ok(())
}

pub fn ipc_call(ipc: &PluginIpcConfig, method: &str, params: Value) -> Result<Value, String> {
    let addr: SocketAddr = format!("{}:{}", ipc.host, ipc.port)
        .parse()
        .map_err(|error| format!("bad ipc addr: {error}"))?;
    let mut stream = TcpStream::connect_timeout(&addr, IPC_TIMEOUT)
        .map_err(|error| format!("ipc connect failed: {error}"))?;
    stream
        .set_read_timeout(Some(IPC_TIMEOUT))
        .map_err(|error| error.to_string())?;
    stream
        .set_write_timeout(Some(IPC_TIMEOUT))
        .map_err(|error| error.to_string())?;

    let request = json!({
        "id": 1,
        "method": method,
        "params": params,
    });
    let payload = format!("{request}\n");
    stream
        .write_all(payload.as_bytes())
        .map_err(|error| format!("ipc write failed: {error}"))?;

    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .map_err(|error| format!("ipc read failed: {error}"))?;
    let response: Value =
        serde_json::from_str(line.trim()).map_err(|error| format!("ipc decode failed: {error}"))?;
    if response.get("ok").and_then(Value::as_bool) == Some(false) {
        let message = response
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("plugin ipc error");
        return Err(message.to_string());
    }
    Ok(response.get("result").cloned().unwrap_or(Value::Null))
}

pub fn invoke_plugin(id: &str, method: &str, params: Value) -> Result<Value, String> {
    let host = host_lock().lock().expect("plugin host lock poisoned");
    let plugin = host
        .discovered
        .iter()
        .find(|item| item.manifest.id == id)
        .ok_or_else(|| format!("plugin not found: {id}"))?;
    if !host.processes.contains_key(id) {
        return Err(format!("plugin not running: {id}"));
    }
    let result = ipc_call(&plugin.manifest.ipc, method, params)?;
    append_plugin_log(id, &format!("ipc {method} ok"));
    Ok(result)
}

pub fn bootstrap(_app: &AppHandle) {
    // Better Voice is embedded in-process (`voice` module). Sidecar plugins stay disabled.
    logging::append_event("plugin host idle (in-process voice)");
}

#[tauri::command]
pub fn list_plugins(state: State<'_, ConfigState>) -> Result<Vec<PluginRuntimeInfo>, String> {
    let config = state.load().map_err(|error| error.to_string())?;
    Ok(list_runtime(&config.plugins.enabled))
}

#[tauri::command]
pub async fn set_plugin_enabled(
    app: AppHandle,
    state: State<'_, ConfigState>,
    id: String,
    enabled: bool,
) -> Result<Vec<PluginRuntimeInfo>, String> {
    let mut config = state.load().map_err(|error| error.to_string())?;
    if enabled {
        if !config.plugins.enabled.iter().any(|item| item == &id) {
            config.plugins.enabled.push(id.clone());
        }
    } else {
        config.plugins.enabled.retain(|item| item != &id);
    }
    let saved = state.save(config).map_err(|error| error.to_string())?;
    let runtime = sync_enabled(&app, &saved.plugins);
    let _ = app.emit("config:changed", saved);
    Ok(runtime)
}

#[tauri::command]
pub fn plugin_invoke(
    id: String,
    method: String,
    params: Option<Value>,
) -> Result<Value, String> {
    invoke_plugin(&id, &method, params.unwrap_or(Value::Null))
}

#[tauri::command]
pub fn get_plugin_settings_blob(
    state: State<'_, ConfigState>,
    id: String,
) -> Result<Value, String> {
    let config = state.load().map_err(|error| error.to_string())?;
    Ok(config
        .plugins
        .settings
        .get(&id)
        .cloned()
        .unwrap_or(Value::Null))
}

#[tauri::command]
pub async fn save_plugin_settings_blob(
    app: AppHandle,
    state: State<'_, ConfigState>,
    id: String,
    settings: Value,
) -> Result<PluginsConfig, String> {
    let mut config = state.load().map_err(|error| error.to_string())?;
    config.plugins.settings.insert(id, settings);
    let saved = state.save(config).map_err(|error| error.to_string())?;
    let _ = app.emit("config:changed", saved.clone());
    Ok(saved.plugins)
}

pub fn runtime_snapshot() -> Vec<PluginRuntimeInfo> {
    let host = host_lock().lock().expect("plugin host lock poisoned");
    let mut list: Vec<_> = host.runtime.values().cloned().collect();
    list.sort_by(|a, b| a.id.cmp(&b.id));
    list
}