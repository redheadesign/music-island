use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Manager};

static LAUNCH_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
static SHOW_ONBOARDING: AtomicBool = AtomicBool::new(false);
static INTRO_CLOSED: AtomicBool = AtomicBool::new(false);
static INTRO_GENERATION: AtomicU64 = AtomicU64::new(1);

fn should_onboard(has_config: bool, autostart: bool) -> bool {
    !has_config && !autostart
}

pub fn prepare() {
    let existing = crate::config::config_path().is_ok_and(|path| path.exists());
    let autostart = std::env::args().any(|arg| arg == crate::autostart::STARTUP_ARG);
    SHOW_ONBOARDING.store(should_onboard(existing, autostart), Ordering::Release);
}

pub fn is_onboarding() -> bool {
    SHOW_ONBOARDING.load(Ordering::Acquire)
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntroState {
    generation: u64,
    closed: bool,
}

#[tauri::command]
pub fn get_intro_state() -> IntroState {
    IntroState {
        generation: INTRO_GENERATION.load(Ordering::Acquire),
        closed: INTRO_CLOSED.load(Ordering::Acquire),
    }
}

#[derive(Clone, serde::Serialize)]
pub struct LaunchState {
    generation: u64,
    onboarding: bool,
    config: crate::config::AppConfig,
    #[serde(rename = "exePath")]
    exe_path: Option<String>,
}

#[tauri::command]
pub fn get_launch_state(app: AppHandle) -> Result<LaunchState, String> {
    Ok(LaunchState {
        generation: INTRO_GENERATION.load(Ordering::Acquire),
        onboarding: is_onboarding(),
        exe_path: std::env::current_exe().ok().map(|path| path.display().to_string()),
        config: app
            .state::<crate::config::ConfigState>()
            .load()
            .map_err(|e| e.to_string())?,
    })
}

#[tauri::command]
pub async fn finish_onboarding(app: AppHandle, generation: Option<u64>, enable_autostart: Option<bool>) -> Result<(), String> {
    // Shortcut creation uses Windows/PowerShell; keep it off the event loop.
    tauri::async_runtime::spawn_blocking(move || finish_launch(app, generation, enable_autostart))
        .await.map_err(|error| error.to_string())?
}

fn finish_launch(app: AppHandle, generation: Option<u64>, enable_autostart: Option<bool>) -> Result<(), String> {
    let _guard = LAUNCH_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if !generation_matches(generation) { return Err("Launch changed; please try again".into()); }
    let state = app.state::<crate::config::ConfigState>();
    let config = state.load().map_err(|e| e.to_string())?;
    let config = persist_onboarding(config, enable_autostart == Some(true),
        |enabled| crate::autostart::sync(enabled).map(|_| ()),
        |config| state.save(config).map_err(|e| e.to_string()))?;
    let _ = app.emit("config:changed", config);
    SHOW_ONBOARDING.store(false, Ordering::Release);
    if let Some(window) = app.get_webview_window("intro") {
        window.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn persist_onboarding(
    mut config: crate::config::AppConfig,
    enable: bool,
    mut sync: impl FnMut(bool) -> Result<(), String>,
    save: impl FnOnce(crate::config::AppConfig) -> Result<crate::config::AppConfig, String>,
) -> Result<crate::config::AppConfig, String> {
    let previous = config.behavior.launch_at_startup;
    if enable {
        if let Err(error) = sync(true) {
            // Registration can partially succeed (Run entry before shortcut).
            return match sync(previous) {
                Ok(()) => Err(error),
                Err(rollback) => Err(format!("{error}; restoring autostart failed: {rollback}")),
            };
        }
        config.behavior.launch_at_startup = true;
    }
    let ui = config
        .plugins
        .settings
        .entry("ui".into())
        .or_insert_with(|| serde_json::json!({}));
    ui["onboardingCompleted"] = true.into();
    ui["hoverCoachCompleted"] = false.into();
    match save(config) {
        Ok(saved) => Ok(saved),
        Err(error) => {
            if enable {
                sync(previous).map_err(|rollback| format!("{error}; restoring autostart failed: {rollback}"))?;
            }
            Err(error)
        }
    }
}

pub fn closed(app: &AppHandle) {
    INTRO_CLOSED.store(true, Ordering::Release);
    let _ = app.emit("intro:closed", get_intro_state());
}

pub fn replay(app: &AppHandle, onboarding: bool) -> Result<(), String> {
    let _guard = LAUNCH_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if crate::shutdown::is_stopping() { return Err("Application is shutting down".into()); }
    let state = app.state::<crate::config::ConfigState>();
    let mut config = state.load().map_err(|e| e.to_string())?;
    config
        .plugins
        .settings
        .entry("ui".into())
        .or_insert_with(|| serde_json::json!({}))["hoverCoachCompleted"] = false.into();
    let saved = state.save(config).map_err(|e| e.to_string())?;
    INTRO_CLOSED.store(false, Ordering::Release);
    INTRO_GENERATION.fetch_add(1, Ordering::AcqRel);
    SHOW_ONBOARDING.store(onboarding, Ordering::Release);
    let _ = app.emit("config:changed", saved);
    if let Err(error) = crate::window::replay_intro_window(app) {
        closed(app);
        return Err(error.to_string());
    }
    let _ = app.emit_to("intro", "intro:replay", get_launch_state(app.clone())?);
    Ok(())
}

fn generation_matches(generation: Option<u64>) -> bool {
    accepts_generation(generation, INTRO_GENERATION.load(Ordering::Acquire))
}

fn accepts_generation(expected: Option<u64>, current: u64) -> bool {
    expected.is_none_or(|value| value == current)
}

pub fn close(app: &AppHandle, generation: Option<u64>) -> Result<(), String> {
    let _guard = LAUNCH_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if !generation_matches(generation) { return Ok(()); }
    crate::window::close_intro_window(app).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn replay_onboarding(app: AppHandle) -> Result<(), String> {
    replay(&app, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn startup_is_opt_in_and_skip_preserves_existing_setting() {
        for enabled in [false, true] {
            let mut config = crate::config::AppConfig::default();
            config.behavior.launch_at_startup = enabled;
            let saved = persist_onboarding(config, false, |_| panic!("skip must not change Windows"), Ok).unwrap();
            assert_eq!(saved.behavior.launch_at_startup, enabled);
            assert_eq!(saved.plugins.settings["ui"]["onboardingCompleted"], true);
        }
    }
    #[test]
    fn startup_registration_and_persistence_failures_do_not_finish() {
        let mut calls = vec![];
        let result = persist_onboarding(crate::config::AppConfig::default(), true, |enabled| { calls.push(enabled); if enabled { Err("registration failed".into()) } else { Ok(()) } }, |_| panic!("must not save"));
        assert!(result.is_err());
        assert_eq!(calls, vec![true, false]);
        calls.clear();
        let result = persist_onboarding(crate::config::AppConfig::default(), true, |enabled| { calls.push(enabled); Ok(()) }, |_| Err("disk full".into()));
        assert!(result.is_err());
        assert_eq!(calls, vec![true, false]);
    }
    #[test]
    fn startup_is_enabled_only_after_registration_succeeds() {
        let mut calls = vec![];
        let saved = persist_onboarding(crate::config::AppConfig::default(), true, |enabled| { calls.push(enabled); Ok(()) }, Ok).unwrap();
        assert!(saved.behavior.launch_at_startup);
        assert_eq!(calls, vec![true]);
    }
    #[test]
    fn old_intro_completion_cannot_close_replayed_launch() {
        assert!(!accepts_generation(Some(1), 2));
        assert!(accepts_generation(Some(2), 2));
    }
    #[test]
    fn only_new_manual_launch_opens_wizard() {
        assert!(should_onboard(false, false));
        assert!(!should_onboard(true, false));
        assert!(!should_onboard(false, true));
        assert!(!should_onboard(true, true));
    }
}
