use crate::window;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Emitter, Manager,
};

pub fn setup_tray(app: &mut App) -> tauri::Result<()> {
    let show_hide = MenuItem::with_id(app, "show_hide", "Show / Hide", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let reset = MenuItem::with_id(app, "reset_position", "Reset position", true, None::<&str>)?;
    let updates = MenuItem::with_id(app, "check_updates", "Check for updates", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_hide, &settings, &reset, &updates, &quit])?;

    let mut builder = TrayIconBuilder::new().menu(&menu).tooltip("Music Island");

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let is_visible = window.is_visible().unwrap_or(false);
                    let _ = if is_visible { window.hide() } else { window.show() };
                }
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show_hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let is_visible = window.is_visible().unwrap_or(false);
                    let _ = if is_visible { window.hide() } else { window.show() };
                }
            }
            "settings" => {
                let _ = window::open_settings_window(app);
            }
            "reset_position" => {
                let _ = window::reset_overlay_position(app);
            }
            "check_updates" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("overlay:check-updates", ());
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
