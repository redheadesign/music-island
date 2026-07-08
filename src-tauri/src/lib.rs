mod config;
mod diagnostics;
mod logging;
mod media;
mod tray;
mod updater;
mod window;

use config::{AppConfig, ConfigState};
use media::{MediaCommand, MediaSnapshot};
use tauri::State;

#[tauri::command]
async fn get_config(state: State<'_, ConfigState>) -> Result<AppConfig, String> {
    state.load().map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_config(config: AppConfig, state: State<'_, ConfigState>) -> Result<AppConfig, String> {
    state.save(config).map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_media_snapshot() -> Result<MediaSnapshot, String> {
    media::current_snapshot().await.map_err(|error| error.to_string())
}

#[tauri::command]
async fn media_control(command: MediaCommand) -> Result<(), String> {
    media::send_command(command)
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
async fn get_collapsed_gesture_state(app: tauri::AppHandle) -> Result<window::CollapsedGestureState, String> {
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
            get_media_snapshot,
            media_control,
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
                Err(error) => logging::append_event(&format!("overlay window setup failed: {error}")),
            }
            match tray::setup_tray(app) {
                Ok(()) => logging::append_event("tray setup ok"),
                Err(error) => logging::append_event(&format!("tray setup failed: {error}")),
            }
            media::start_watcher(handle);
            logging::append_event("media watcher started");
            Ok(())
        });

    logging::append_event("app run requested");
    match builder.run(tauri::generate_context!()) {
        Ok(()) => logging::append_event("app run finished"),
        Err(error) => logging::append_event(&format!("app run failed: {error}")),
    }
}
