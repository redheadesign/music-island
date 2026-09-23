use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub revision: u64,
    pub operation_id: u64,
    pub phase: String,
    pub ready: bool,
    pub text: String,
    pub error: Option<String>,
    #[serde(skip)]
    streaming: bool,
}
static STATUS: OnceLock<Mutex<Snapshot>> = OnceLock::new();
fn state() -> &'static Mutex<Snapshot> {
    STATUS.get_or_init(Default::default)
}
pub fn snapshot() -> Snapshot {
    state().lock().unwrap_or_else(|e| e.into_inner()).clone()
}
fn update(app: &AppHandle, f: impl FnOnce(&mut Snapshot)) {
    let snapshot = {
        let mut s = state().lock().unwrap_or_else(|e| e.into_inner());
        f(&mut s);
        s.revision += 1;
        s.clone()
    };
    let _ = app.emit("dictation:status", snapshot);
}
pub fn begin(app: &AppHandle) {
    update(app, |s| {
        s.operation_id += 1;
        s.phase = "preparing".into();
        s.ready = false;
        s.streaming = false;
        s.text.clear();
        s.error = None;
    });
}
pub fn preparing(app: &AppHandle, streaming: bool) {
    update(app, |s| {
        s.phase = "preparing".into();
        s.ready = false;
        s.streaming = streaming;
    });
}
pub fn phase(app: &AppHandle, phase: &str) {
    update(app, |s| {
        s.phase = phase.into();
    });
}
pub fn ready(app: &AppHandle) {
    update(app, |s| {
        s.ready = true;
        // Late overlay subscribers must recover the same presentation as an
        // observer of show-overlay, including the live-text mode.
        s.phase = if s.streaming {
            "streaming"
        } else {
            "recording"
        }
        .into();
    });
}
pub fn result(app: &AppHandle, text: String, error: Option<String>) {
    update(app, |s| {
        s.text = text;
        s.phase = if error.is_some() {
            "error"
        } else {
            "completed"
        }
        .into();
        s.error = error;
    });
}

pub fn text_for_copy(operation_id: u64) -> Result<String, String> {
    let s = snapshot();
    if s.operation_id != operation_id || s.text.is_empty() {
        return Err("This dictation result is no longer available".into());
    }
    Ok(s.text)
}

pub fn copied(app: &AppHandle, operation_id: u64) -> bool {
    let next = {
        let mut s = state().lock().unwrap_or_else(|e| e.into_inner());
        if s.operation_id != operation_id {
            return false;
        }
        s.phase = "completed".into();
        s.error = None;
        s.revision += 1;
        s.clone()
    };
    let _ = app.emit("dictation:status", next);
    true
}
