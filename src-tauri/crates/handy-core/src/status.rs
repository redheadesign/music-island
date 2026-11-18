use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioProgress {
    completed_audio_ms: u64,
    total_audio_ms: u64,
}
#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub revision: u64,
    pub operation_id: u64,
    pub phase: String,
    pub ready: bool,
    pub text: String,
    pub error: Option<String>,
    pub shortcut_activation: crate::settings::ShortcutActivation,
    pub model_loading: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<AudioProgress>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capture_constraint: Option<CaptureConstraint>,
    #[serde(skip)]
    streaming: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureConstraint {
    required_input: String,
    predecode: bool,
}

pub fn capture_constraint(app: &AppHandle) -> Option<CaptureConstraint> {
    std::env::var("MUSIC_ISLAND_DICTATION_REQUIRED_INPUT").ok().map(|required_input| CaptureConstraint {
        required_input,
        predecode: crate::gigaam_predecode::enabled(crate::settings::get_settings(app).gigaam_background_recognition),
    })
}
// A manual selection may load a model and roll back on failure. A new capture
// cannot begin between its settings write and that rollback.
static MODEL_SELECTION: Mutex<()> = Mutex::new(());
pub(crate) fn lock_model_selection() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    MODEL_SELECTION.try_lock().map_err(|_| "A model change is already in progress".into())
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
        if s.phase != "transcribing" {
            s.progress = None;
        }
        s.revision += 1;
        s.clone()
    };
    crate::diagnostics::event(&format!(
        "operation={} phase={} ready={} error={}",
        snapshot.operation_id,
        snapshot.phase,
        snapshot.ready,
        snapshot.error.is_some()
    ));
    let _ = app.emit("dictation:status", snapshot);
}
pub fn begin(app: &AppHandle) -> bool {
    let Ok(_selection) = lock_model_selection() else {
        result(app, String::new(), Some("The selected model is being changed".into()));
        return false;
    };
    let activation = crate::settings::get_settings(app).shortcut_activation;
    update(app, |s| {
        s.shortcut_activation = activation;
        s.operation_id += 1;
        s.phase = "preparing".into();
        s.ready = false;
        s.streaming = false;
        s.text.clear();
        s.error = None;
    });
    true
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
pub fn model_loading(app: &AppHandle, loading: bool) {
    update(app, |s| s.model_loading = loading);
}

impl Snapshot {
    pub(crate) fn uses_recognition_model(&self) -> bool {
        matches!(self.phase.as_str(), "preparing" | "recording" | "streaming" | "transcribing")
    }

    fn set_audio_progress(&mut self, operation: u64, completed: usize, total: usize) -> bool {
        if self.operation_id != operation || self.phase != "transcribing" || total == 0 || completed > total {
            return false;
        }
        let progress = AudioProgress {
            completed_audio_ms: (completed / 16) as u64,
            total_audio_ms: (total / 16) as u64,
        };
        if self.progress.is_some_and(|last| {
            last.total_audio_ms != progress.total_audio_ms
                || last.completed_audio_ms >= progress.completed_audio_ms
        }) {
            return false;
        }
        self.progress = Some(progress);
        true
    }
}

pub fn audio_progress(app: &AppHandle, operation: u64, completed: usize, total: usize) {
    let snapshot = {
        let mut s = state().lock().unwrap_or_else(|e| e.into_inner());
        if !s.set_audio_progress(operation, completed, total) {
            return;
        }
        s.revision += 1;
        s.clone()
    };
    let _ = app.emit("dictation:status", snapshot);
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
        s.progress = None;
        s.error = None;
        s.revision += 1;
        s.clone()
    };
    let _ = app.emit("dictation:status", next);
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_capture_and_recognition_own_the_selected_model() {
        let mut status = Snapshot::default();
        for phase in ["preparing", "recording", "streaming", "transcribing"] {
            status.phase = phase.into();
            assert!(status.uses_recognition_model(), "{phase}");
        }
        for phase in ["idle", "processing", "completed", "cancelled", "error", ""] {
            status.phase = phase.into();
            assert!(!status.uses_recognition_model(), "{phase}");
        }
    }

    #[test]
    fn audio_progress_belongs_to_the_current_transcribing_operation() {
        let mut status = Snapshot {
            phase: "transcribing".into(),
            operation_id: 2,
            ..Default::default()
        };
        assert!(!status.set_audio_progress(1, 0, 32_000));
        assert!(status.set_audio_progress(2, 0, 32_000));
        assert!(status.set_audio_progress(2, 16_000, 32_000));
        assert!(!status.set_audio_progress(2, 0, 32_000));
        assert_eq!(status.progress.unwrap().completed_audio_ms, 1000);
        assert_eq!(serde_json::to_value(&status).unwrap()["progress"]["totalAudioMs"], 2000);
        status.phase = "cancelled".into();
        assert!(!status.set_audio_progress(2, 32_000, 32_000));
    }
}
