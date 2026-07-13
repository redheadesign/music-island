mod config;
mod diagnostics;
mod logging;
mod media;
mod tray;
mod updater;
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
async fn save_config(
    app: tauri::AppHandle,
    config: AppConfig,
    state: State<'_, ConfigState>,
) -> Result<AppConfig, String> {
    let saved = state.save(config).map_err(|error| error.to_string())?;
    media::set_preferred_source(saved.media.preferred_source_app_id.clone());
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
fn get_direct_yandex_status() -> yandex::DirectYandexStatus {
    yandex::status()
}

#[tauri::command]
async fn enable_direct_yandex() -> Result<yandex::DirectYandexStatus, String> {
    yandex::enable().await.map_err(|error| error.to_string())
}

#[tauri::command]
async fn disable_direct_yandex(restart_plain: bool) -> Result<yandex::DirectYandexStatus, String> {
    yandex::disable(restart_plain)
        .await
        .map_err(|error| error.to_string())
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
async fn copy_diagnostics(app: tauri::AppHandle) -> Result<String, String> {
    diagnostics::collect(&app).map_err(|error| error.to_string())
}

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<updater::UpdateCheckResult, String> {
    updater::check_for_updates(app)
        .await
        .map_err(|error| error.to_string())
}

pub fn run() {
    logging::install_panic_hook();
    logging::append_event("app bootstrap started");
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--startup"]),
        ))
        .manage(ConfigState::new())
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            preview_config,
            get_media_snapshot,
            get_smtc_health,
            list_media_sessions,
            media_control,
            get_direct_yandex_status,
            enable_direct_yandex,
            disable_direct_yandex,
            reset_window_position,
            set_overlay_bounds,
            get_collapsed_gesture_state,
            open_settings_window,
            copy_diagnostics,
            check_for_updates
        ])
        .on_window_event(|window, event| {
            if window.label() == "settings" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            logging::append_event("setup started");
            let handle = app.handle().clone();
            match window::setup_overlay_window(&handle) {
                Ok(()) => logging::append_event("overlay window setup ok"),
                Err(error) => {
                    logging::append_event(&format!("overlay window setup failed: {error}"))
                }
            }
            match tray::setup_tray(app) {
                Ok(()) => logging::append_event("tray setup ok"),
                Err(error) => logging::append_event(&format!("tray setup failed: {error}")),
            }
            media::start_watcher(handle.clone());
            window::start_gesture_watcher(app.handle().clone());
            if let Ok(config) = app.state::<ConfigState>().load() {
                media::set_preferred_source(config.media.preferred_source_app_id.clone());
                if config.behavior.pin_expanded {
                    let _ = window::set_overlay_clickthrough(&handle, false);
                }
                if matches!(config.media.protocol, config::MediaProtocol::YandexDirect)
                    && config.media.direct_yandex_consent
                {
                    tauri::async_runtime::spawn(async {
                        if let Err(error) = yandex::enable().await {
                            logging::append_event(&format!(
                                "direct Yandex startup failed, keeping SMTC fallback: {error}"
                            ));
                        }
                    });
                }
            }
            logging::append_event("media watcher started");
            Ok(())
        });

    logging::append_event("app run requested");
    match builder.run(tauri::generate_context!()) {
        Ok(()) => logging::append_event("app run finished"),
        Err(error) => logging::append_event(&format!("app run failed: {error}")),
    }
}
