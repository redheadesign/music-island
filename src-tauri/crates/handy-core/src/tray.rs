use tauri::{AppHandle, Emitter};
#[derive(Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TrayIconState {
    Idle,
    Recording,
    Transcribing,
}
pub fn set_tray_state(app: &AppHandle, state: TrayIconState) {
    let _ = app.emit("dictation:state", state);
}
pub fn refresh_tray_icon(_: &AppHandle) {}
pub fn update_tray_menu(_: &AppHandle) {}
pub fn set_tray_visibility(_: &AppHandle, _: bool) {}
