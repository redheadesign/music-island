mod autostart;
mod config;
mod diagnostics;
mod install;
mod logging;
mod media;
mod plugins;
mod tray;
mod updater;
mod usage;
mod voice;
mod window;
mod yandex;

use config::{AppConfig, ConfigState};
use media::{health::SmtcHealthSnapshot, MediaCommand, MediaSessionInfo, MediaSnapshot};
use tauri::{Emitter, Manager, State};

#[tauri::command]
async fn get_config(state: State<'_, ConfigState>) -> Result<AppConfig, String> {
    state.load().map_err(|error| error.to_string())
}

#[tauri::command]
fn get_taskbar_status() -> window::taskbar::TaskbarStatus {
    window::taskbar::status()
}

#[tauri::command]
async fn save_config(
    app: tauri::AppHandle,
    config: AppConfig,
    state: State<'_, ConfigState>,
) -> Result<AppConfig, String> {
    let saved = state.save(config).map_err(|error| error.to_string())?;
    emit_autostart_sync(&app, saved.behavior.launch_at_startup);
    media::set_preferred_source(saved.media.preferred_source_app_id.clone());
    media::switch_active_provider(
        &app,
        match saved.media.protocol {
            config::MediaProtocol::Smtc => media::MediaProvider::Smtc,
            config::MediaProtocol::YandexDirect => media::MediaProvider::YandexDirect,
        },
    );
    usage::sync_config(&app, app.state::<usage::UsageState>().inner(), &saved);
    let _ = app.emit("config:changed", saved.clone());
    Ok(saved)
}

#[tauri::command]
fn preview_config(app: tauri::AppHandle, config: AppConfig) {
    let _ = app.emit("config:preview", config);
}

#[tauri::command]
async fn get_media_snapshot() -> Result<MediaSnapshot, String> {
    media::current_snapshot()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_smtc_health() -> SmtcHealthSnapshot {
    media::current_health()
}

#[tauri::command]
async fn list_media_sessions() -> Result<Vec<MediaSessionInfo>, String> {
    media::list_sessions()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn media_control(command: MediaCommand) -> Result<(), String> {
    media::send_command(command)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_yandex_wave_presets() -> Result<yandex::WaveCatalogResult, String> {
    yandex::wave_presets()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn select_yandex_wave_preset(id: String) -> Result<yandex::WaveSelectionResult, String> {
    yandex::select_wave_preset(&id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn clear_yandex_wave_selection() -> Result<yandex::WaveSelectionResult, String> {
    yandex::clear_wave_selection()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_direct_yandex_status() -> yandex::DirectYandexStatus {
    yandex::status()
}

#[tauri::command]
async fn enable_direct_yandex(app: tauri::AppHandle) -> Result<yandex::DirectYandexStatus, String> {
    let status = yandex::enable().await.map_err(|error| error.to_string())?;
    let _ = app.emit("direct:status", status.clone());
    Ok(status)
}

#[tauri::command]
async fn disable_direct_yandex(
    app: tauri::AppHandle,
    restart_plain: bool,
) -> Result<yandex::DirectYandexStatus, String> {
    let status = yandex::disable(restart_plain)
        .await
        .map_err(|error| error.to_string())?;
    let _ = app.emit("direct:status", status.clone());
    Ok(status)
}

#[tauri::command]
async fn reset_window_position(app: tauri::AppHandle) -> Result<(), String> {
    window::reset_overlay_position(&app).map_err(|error| error.to_string())
}

#[tauri::command]
async fn set_overlay_bounds(
    app: tauri::AppHandle,
    expanded: bool,
    visual_width: f64,
    visual_height: f64,
) -> Result<(), String> {
    window::set_overlay_bounds(&app, expanded, visual_width, visual_height)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_collapsed_gesture_state(
    app: tauri::AppHandle,
) -> Result<window::CollapsedGestureState, String> {
    window::get_collapsed_gesture_state(&app).map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    window::open_settings_window(&app).map_err(|error| error.to_string())
}

#[tauri::command]
async fn close_intro_window(app: tauri::AppHandle) -> Result<(), String> {
    window::close_intro_window(&app).map_err(|error| error.to_string())
}

#[tauri::command]
async fn replay_intro_window(app: tauri::AppHandle) -> Result<(), String> {
    window::replay_intro_window(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn get_install_handoff(state: State<'_, install::InstallState>) -> Option<install::NewerHandoff> {
    state
        .newer_handoff
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

#[tauri::command]
fn open_newer_install(
    app: tauri::AppHandle,
    state: State<'_, install::InstallState>,
) -> Result<(), String> {
    let handoff = state
        .newer_handoff
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
        .ok_or_else(|| "No newer install recorded".to_string())?;
    install::open_path(&handoff.path)?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
async fn copy_diagnostics(app: tauri::AppHandle) -> Result<String, String> {
    diagnostics::collect(&app)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn check_for_updates(
    app: tauri::AppHandle,
    force_same_version: Option<bool>,
) -> Result<updater::UpdateCheckResult, String> {
    updater::check_for_updates(app, force_same_version.unwrap_or(false))
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn download_and_install_update(
    app: tauri::AppHandle,
    force_same_version: Option<bool>,
) -> Result<(), String> {
    updater::download_and_install_update(app, force_same_version.unwrap_or(false))
        .await
        .map_err(|error| error.to_string())
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AutostartSyncEvent {
    ok: bool,
    message: Option<String>,
    enabled: bool,
    exe_path: Option<String>,
    command: Option<String>,
}

fn emit_autostart_sync(app: &tauri::AppHandle, enabled: bool) {
    match autostart::sync(enabled) {
        Ok(status) => {
            if status.path_updated {
                logging::append_event(&format!(
                    "autostart entry refreshed at {}",
                    status.command.clone().unwrap_or_default()
                ));
            }
            let _ = app.emit(
                "autostart:sync",
                AutostartSyncEvent {
                    ok: true,
                    message: if status.enabled {
                        Some("Автозапуск прописан успешно".into())
                    } else {
                        Some("Автозапуск выключен".into())
                    },
                    enabled: status.enabled,
                    exe_path: status.exe_path,
                    command: status.command,
                },
            );
        }
        Err(error) => {
            logging::append_event(&format!("autostart sync failed: {error}"));
            let _ = app.emit(
                "autostart:sync",
                AutostartSyncEvent {
                    ok: false,
                    message: Some(error),
                    enabled,
                    exe_path: None,
                    command: None,
                },
            );
        }
    }
}

pub fn run() {
    logging::install_panic_hook();
    logging::append_event("app bootstrap started");
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            logging::append_event("second instance blocked; showing already-running notice");
            let _ = window::show_already_running_notice(app);
        }))
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--startup"]),
        ))
        .manage(ConfigState::new())
        .manage(usage::UsageState::default())
        .manage(voice::VoiceEngineState::new())
        .manage(install::InstallState::default())
        .invoke_handler(tauri::generate_handler![
            get_config,
            get_taskbar_status,
            save_config,
            preview_config,
            get_media_snapshot,
            get_smtc_health,
            list_media_sessions,
            media_control,
            list_yandex_wave_presets,
            select_yandex_wave_preset,
            clear_yandex_wave_selection,
            get_direct_yandex_status,
            enable_direct_yandex,
            disable_direct_yandex,
            reset_window_position,
            set_overlay_bounds,
            get_collapsed_gesture_state,
            open_settings_window,
            close_intro_window,
            replay_intro_window,
            get_install_handoff,
            open_newer_install,
            copy_diagnostics,
            check_for_updates,
            download_and_install_update,
            usage::usage_get_snapshot,
            usage::usage_connect,
            usage::usage_disconnect,
            usage::usage_refresh,
            plugins::list_plugins,
            plugins::set_plugin_enabled,
            plugins::plugin_invoke,
            plugins::get_plugin_settings_blob,
            plugins::save_plugin_settings_blob,
            voice::voice_invoke
        ])
        .on_window_event(|window, event| {
            if matches!(window.label(), "settings" | "already-running") {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            logging::append_event("setup started");
            updater::cleanup_stale_artifacts();
            let handle = app.handle().clone();
            let current_version = app.package_info().version.to_string();
            let defer_newer = match install::reconcile(&current_version) {
                install::ReconcileResult::Continue => false,
                install::ReconcileResult::DeferToNewer(handoff) => {
                    let state = app.state::<install::InstallState>();
                    *state
                        .newer_handoff
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(handoff);
                    true
                }
            };
            match window::setup_overlay_window(&handle) {
                Ok(()) => logging::append_event("overlay window setup ok"),
                Err(error) => {
                    logging::append_event(&format!("overlay window setup failed: {error}"))
                }
            }
            match window::setup_settings_window(&handle) {
                Ok(()) => logging::append_event("settings window setup ok"),
                Err(error) => {
                    logging::append_event(&format!("settings window setup failed: {error}"))
                }
            }
            match window::setup_already_running_window(&handle) {
                Ok(()) => logging::append_event("already-running window setup ok"),
                Err(error) => {
                    logging::append_event(&format!("already-running window setup failed: {error}"))
                }
            }
            if defer_newer {
                logging::append_event("install: deferring to newer build; showing handoff notice");
                if let Some(main) = handle.get_webview_window("main") {
                    let _ = main.hide();
                }
                let _ = window::show_already_running_notice(&handle);
                return Ok(());
            }
            match window::setup_intro_window(&handle) {
                Ok(()) => logging::append_event("intro window setup ok"),
                Err(error) => logging::append_event(&format!("intro window setup failed: {error}")),
            }
            match tray::setup_tray(app) {
                Ok(()) => logging::append_event("tray setup ok"),
                Err(error) => logging::append_event(&format!("tray setup failed: {error}")),
            }
            if let Ok(config) = app.state::<ConfigState>().load() {
                usage::sync_config(&handle, app.state::<usage::UsageState>().inner(), &config);
                emit_autostart_sync(&handle, config.behavior.launch_at_startup);
                media::set_preferred_source(config.media.preferred_source_app_id.clone());
                media::set_active_provider(match config.media.protocol {
                    config::MediaProtocol::Smtc => media::MediaProvider::Smtc,
                    config::MediaProtocol::YandexDirect => media::MediaProvider::YandexDirect,
                });
                // Pin keeps the island open; click-through is driven by the cursor
                // hit-band watcher (fullscreen HWND), not forced off for the whole monitor.
                if matches!(config.media.protocol, config::MediaProtocol::YandexDirect)
                    && config.media.direct_yandex_consent
                {
                    let direct_port = config.media.direct_yandex_port;
                    let direct_app = handle.clone();
                    let config_state = app.state::<ConfigState>().inner().clone();
                    tauri::async_runtime::spawn(async move {
                        match yandex::reattach(direct_port).await {
                            Ok(status) if status.port != direct_port => {
                                if let Ok(mut current) = config_state.load() {
                                    current.media.direct_yandex_port = status.port;
                                    if let Ok(saved) = config_state.save(current) {
                                        let _ = direct_app.emit("config:changed", saved);
                                    }
                                }
                            }
                            Ok(_) => {}
                            Err(error) => logging::append_event(&format!(
                                "direct Yandex startup reattach unavailable: {error}"
                            )),
                        }
                        let _ = direct_app.emit("direct:status", yandex::status());
                    });
                }
            }
            media::start_watcher(handle.clone());
            window::start_gesture_watcher(app.handle().clone());
            window::taskbar::start(app.handle().clone());
            plugins::bootstrap(&handle);
            logging::append_event("media watcher started");
            Ok(())
        });

    logging::append_event("app run requested");
    match builder.run(tauri::generate_context!()) {
        Ok(()) => logging::append_event("app run finished"),
        Err(error) => logging::append_event(&format!("app run failed: {error}")),
    }
}
