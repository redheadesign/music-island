use crate::{config::{ConfigState, Locale}, window};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Manager, Wry,
};

struct TrayItems {
    settings: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

fn labels(locale: Locale) -> (&'static str, &'static str) {
    match locale {
        Locale::Ru => ("Настройки", "Выйти"),
        Locale::En => ("Settings", "Quit"),
    }
}

pub fn set_locale(app: &AppHandle, locale: Locale) {
    if let Some(items) = app.try_state::<TrayItems>() {
        let (settings, quit) = labels(locale);
        let _ = items.settings.set_text(settings);
        let _ = items.quit.set_text(quit);
    }
}

pub fn setup_tray(app: &mut App) -> tauri::Result<()> {
    let locale = app.state::<ConfigState>().load().map(|config| config.appearance.locale).unwrap_or_default();
    let (settings_label, quit_label) = labels(locale);
    let settings = MenuItem::with_id(app, "settings", settings_label, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&settings, &quit])?;

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
                let _ = window::open_settings_window(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "settings" => {
                let _ = window::open_settings_window(app);
            }
            "quit" => {
                crate::shutdown::request(app);
            }
            _ => {}
        })
        .build(app)?;

    app.manage(TrayItems { settings, quit });
    Ok(())
}
