use crate::managers::transcription::TranscriptionManager;
use crate::settings::{get_settings, write_settings, ModelUnloadTimeout};
use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Manager, State};

#[derive(Serialize, Type)]
pub struct ModelLoadStatus {
    is_loaded: bool,
    current_model: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub fn set_model_unload_timeout(app: AppHandle, timeout: ModelUnloadTimeout) {
    let mut settings = get_settings(&app);
    settings.model_unload_timeout = timeout;
    write_settings(&app, settings);
}

#[tauri::command]
#[specta::specta]
pub fn get_model_load_status(
    app: AppHandle,
) -> Result<ModelLoadStatus, String> {
    let manager = app.try_state::<std::sync::Arc<TranscriptionManager>>();
    Ok(ModelLoadStatus {
        is_loaded: manager.as_ref().is_some_and(|m| m.is_model_loaded()),
        current_model: manager.and_then(|m| m.get_current_model()),
    })
}

#[tauri::command]
#[specta::specta]
pub fn unload_model_manually(
    transcription_manager: State<std::sync::Arc<TranscriptionManager>>,
) -> Result<(), String> {
    transcription_manager
        .unload_model()
        .map_err(|e| format!("Failed to unload model: {}", e))
}
