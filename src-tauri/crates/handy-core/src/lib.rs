mod actions;
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
mod apple_intelligence;
mod audio_feedback;
pub mod audio_toolkit;
mod autostart;
mod catalog;
pub mod cli;
mod clipboard;
mod commands;
mod focus_target;
mod helpers;
mod input;
mod llm_client;
mod managers;
mod memory;
mod overlay;
mod paste_tx;
pub mod portable;
mod runtime;
pub mod runtime_check;
mod secrets;
mod secure_input;
mod settings;
mod shortcut;
mod signal_handle;
mod status;
pub mod storage;
mod transcription_coordinator;
mod tray;

mod utils;

use managers::{
    audio::AudioRecordingManager, history::HistoryManager, model::ModelManager,
    transcription::TranscriptionManager,
};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
pub use transcription_coordinator::TranscriptionCoordinator;
pub static FILE_LOG_LEVEL: AtomicU8 = AtomicU8::new(log::LevelFilter::Warn as u8);
pub static WEBVIEW_LOG_STREAMING: AtomicBool = AtomicBool::new(false);
struct Initialized(Mutex<bool>);
static ENABLED: AtomicBool = AtomicBool::new(false);
static SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);
pub fn is_enabled() -> bool {
    !SHUTTING_DOWN.load(std::sync::atomic::Ordering::Acquire)
        && ENABLED.load(std::sync::atomic::Ordering::Acquire)
}

/// Settings can inspect disk metadata without extracting the engine, opening a mic,
/// or registering shortcuts. Reuse these managers if dictation is enabled later.
pub async fn prepare_preferences(app: AppHandle) -> Result<(), String> {
    if SHUTTING_DOWN.load(Ordering::Acquire) { return Err("Application is shutting down".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let initialized = app.state::<Initialized>();
        let _guard = initialized.0.lock().map_err(|e| e.to_string())?;
        portable::init();
        portable::prepare_storage().map_err(|e| e.to_string())?;
        if app.try_state::<Arc<ModelManager>>().is_none() {
            app.manage(Arc::new(ModelManager::new(&app).map_err(|e| e.to_string())?));
        }
        if app.try_state::<Arc<HistoryManager>>().is_none() {
            app.manage(Arc::new(HistoryManager::new(&app).map_err(|e| e.to_string())?));
        }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn initialize(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let guard = app.state::<Initialized>();
        let mut ready = guard.0.lock().map_err(|e| e.to_string())?;
        if SHUTTING_DOWN.load(std::sync::atomic::Ordering::Acquire) {
            return Err("Application is shutting down".into());
        }
        if *ready {
            if !is_enabled() {
                commands::initialize_enigo(app.clone())?;
                commands::initialize_shortcuts(app.clone())?;
                if settings::get_settings(&app).always_on_microphone {
                    app.state::<Arc<AudioRecordingManager>>()
                        .start_microphone_stream()
                        .map_err(|e| e.to_string())?;
                }
                ENABLED.store(true, std::sync::atomic::Ordering::Release);
                shortcut::resume_all_shortcuts(&app);
            }
            return Ok(());
        }
        portable::init();
        portable::prepare_storage().map_err(|e| format!("{e:#}"))?;
        portable::extract_resources().map_err(|e| e.to_string())?;
        runtime::initialize().map_err(|e| format!("{e:#}"))?;
        let models = match app.try_state::<Arc<ModelManager>>() {
            Some(models) => models.inner().clone(),
            None => Arc::new(ModelManager::new(&app).map_err(|e| e.to_string())?),
        };
        let transcription =
            Arc::new(TranscriptionManager::new(&app, models.clone()).map_err(|e| e.to_string())?);
        let audio = Arc::new(
            AudioRecordingManager::new(&app, transcription.stream_router())
                .map_err(|e| e.to_string())?,
        );
        let history = match app.try_state::<Arc<HistoryManager>>() {
            Some(history) => history.inner().clone(),
            None => Arc::new(HistoryManager::new(&app).map_err(|e| e.to_string())?),
        };
        app.manage(audio);
        app.manage(models);
        app.manage(transcription);
        app.manage(history);
        app.manage(TranscriptionCoordinator::new(app.clone()));
        *ready = true;
        managers::transcription::init_transcribe_backend();
        managers::transcription::apply_accelerator_settings(&app);
        overlay::create_recording_overlay(&app);
        overlay::update_overlay_enabled_cache(!matches!(
            settings::get_settings(&app).overlay_style,
            settings::OverlayStyle::None
        ));
        commands::initialize_enigo(app.clone())?;
        commands::initialize_shortcuts(app.clone())?;
        *ready = true;
        ENABLED.store(true, std::sync::atomic::Ordering::Release);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn resume(app: AppHandle) -> Result<(), String> {
    initialize(app).await
}

/// Called on a worker by the host, before Tauri starts dropping managed state.
pub fn shutdown(app: &AppHandle) {
    SHUTTING_DOWN.store(true, std::sync::atomic::Ordering::Release);
    ENABLED.store(false, std::sync::atomic::Ordering::Release);
    let initialized = app.state::<Initialized>();
    let _guard = initialized.0.lock().unwrap_or_else(|e| e.into_inner());
    ENABLED.store(false, std::sync::atomic::Ordering::Release);
    storage::stop(app);
    storage::wait_for_io_to_stop(app);
    if let Some(transcription) = app.try_state::<Arc<TranscriptionManager>>() {
        transcription.stop_idle_watcher();
        // Streaming workers temporarily own the engine. Do not report cleanup
        // complete until their cancelled lease has released the model.
        while transcription.is_model_loaded() {
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
    }
}

#[tauri::command]
async fn suspend(app: AppHandle) -> Result<(), String> {
    ENABLED.store(false, std::sync::atomic::Ordering::Release);
    tauri::async_runtime::spawn_blocking(move || {
        // Initialization may still be extracting/loading native resources. Stop
        // only after its setup completes, then revoke the enabled flag again.
        let initialized = app.state::<Initialized>();
        let _guard = initialized.0.lock().unwrap_or_else(|e| e.into_inner());
        ENABLED.store(false, std::sync::atomic::Ordering::Release);
        storage::stop(&app);
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_custom_filler_words(app: AppHandle, words: Vec<String>) {
    let mut settings = settings::get_settings(&app);
    settings.custom_filler_words = if words.is_empty() { None } else { Some(words) };
    settings::write_settings(&app, settings);
}

#[tauri::command]
fn get_status() -> status::Snapshot {
    status::snapshot()
}

#[tauri::command]
fn copy_result(app: AppHandle, operation_id: u64) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let text = status::text_for_copy(operation_id)?;
    app.clipboard()
        .write_text(text)
        .map_err(|e| e.to_string())?;
    if status::copied(&app, operation_id) {
        overlay::hide_recording_overlay(&app);
    }
    Ok(())
}

#[tauri::command]
fn toggle(app: AppHandle, post_process: bool) -> Result<(), String> {
    if !is_enabled() {
        return Err("Dictation has not been enabled".into());
    }
    signal_handle::send_transcription_input(
        &app,
        if post_process {
            "transcribe_with_post_process"
        } else {
            "transcribe"
        },
        "Music Island",
    );
    Ok(())
}

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("dictation")
        .setup(|app, _| {
            app.manage(Initialized(Mutex::new(false)));
            tauri_specta::Builder::<tauri::Wry>::new()
                .events(tauri_specta::collect_events![
                    managers::history::HistoryUpdatePayload,
                    managers::transcription::StreamTextEvent,
                    managers::transcription::StreamPhaseEvent,
                ])
                .mount_events(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            initialize,
            suspend,
            toggle,
            get_status,
            copy_result,
            update_custom_filler_words,
            storage::import_custom_model,
            storage::preview_handy_import,
            storage::import_handy,
            storage::cancel_import,
            storage::clear_history,
            storage::remove_all_models,
            shortcut::change_binding,
            shortcut::reset_binding,
            shortcut::change_shortcut_activation_setting,
            shortcut::change_hold_threshold_ms_setting,
            shortcut::change_audio_feedback_setting,
            shortcut::change_audio_feedback_volume_setting,
            shortcut::change_sound_theme_setting,
            shortcut::change_translate_to_english_setting,
            shortcut::change_selected_language_setting,
            shortcut::change_overlay_position_setting,
            shortcut::change_overlay_style_setting,
            shortcut::change_debug_mode_setting,
            shortcut::change_word_correction_threshold_setting,
            shortcut::change_extra_recording_buffer_setting,
            shortcut::change_paste_delay_ms_setting,
            shortcut::change_paste_delay_after_ms_setting,
            shortcut::change_reliable_paste_setting,
            shortcut::change_paste_method_setting,
            shortcut::get_available_typing_tools,
            shortcut::change_typing_tool_setting,
            shortcut::change_external_script_path_setting,
            shortcut::change_clipboard_handling_setting,
            shortcut::change_auto_submit_setting,
            shortcut::change_auto_submit_key_setting,
            shortcut::change_post_process_enabled_setting,
            shortcut::change_experimental_enabled_setting,
            shortcut::change_post_process_base_url_setting,
            shortcut::change_post_process_api_key_setting,
            shortcut::change_post_process_model_setting,
            shortcut::set_post_process_provider,
            shortcut::fetch_post_process_models,
            shortcut::add_post_process_prompt,
            shortcut::update_post_process_prompt,
            shortcut::delete_post_process_prompt,
            shortcut::set_post_process_selected_prompt,
            shortcut::update_custom_words,
            shortcut::suspend_all_bindings,
            shortcut::resume_all_bindings,
            shortcut::change_mute_while_recording_setting,
            shortcut::change_append_trailing_space_setting,
            shortcut::change_lazy_stream_close_setting,
            shortcut::change_vad_enabled_setting,
            shortcut::change_vad_backend_setting,
            shortcut::change_filler_word_removal_enabled_setting,
            shortcut::change_keyboard_implementation_setting,
            shortcut::get_keyboard_implementation,
            shortcut::change_transcribe_accelerator_setting,
            shortcut::change_ort_accelerator_setting,
            shortcut::change_transcribe_gpu_device,
            shortcut::get_available_accelerators,
            shortcut::handy_keys::start_handy_keys_recording,
            shortcut::handy_keys::stop_handy_keys_recording,
            secure_input::get_secure_input_status,
            secure_input::run_keyboard_diagnostic,
            commands::cancel_operation,
            commands::is_portable,
            commands::is_update_checks_locked,
            commands::get_app_dir_path,
            commands::get_app_settings,
            commands::get_default_settings,
            commands::get_log_dir_path,
            commands::set_log_level,
            commands::open_recordings_folder,
            commands::open_log_dir,
            commands::open_app_data_dir,
            commands::check_apple_intelligence_available,
            commands::initialize_enigo,
            commands::initialize_shortcuts,
            commands::models::get_available_models,
            commands::models::get_model_info,
            commands::models::download_model,
            commands::models::delete_model,
            commands::models::cancel_download,
            commands::models::set_active_model,
            commands::models::get_current_model,
            commands::models::get_transcription_model_status,
            commands::models::is_model_loading,
            commands::models::rescan_local_models,
            commands::audio::update_microphone_mode,
            commands::audio::get_microphone_mode,
            commands::audio::get_windows_microphone_permission_status,
            commands::audio::open_microphone_privacy_settings,
            commands::audio::get_available_microphones,
            commands::audio::set_selected_microphone,
            commands::audio::get_selected_microphone,
            commands::audio::get_available_output_devices,
            commands::audio::set_selected_output_device,
            commands::audio::get_selected_output_device,
            commands::audio::play_test_sound,
            commands::audio::check_custom_sounds,
            commands::audio::set_clamshell_microphone,
            commands::audio::get_clamshell_microphone,
            commands::audio::is_recording,
            commands::audio::get_microphone_channels,
            commands::audio::set_selected_channel,
            commands::transcription::set_model_unload_timeout,
            commands::transcription::get_model_load_status,
            commands::transcription::unload_model_manually,
            commands::history::get_history_entries,
            commands::history::toggle_history_entry_saved,
            commands::history::get_audio_file_path,
            commands::history::delete_history_entry,
            commands::history::retry_history_entry_transcription,
            commands::history::update_history_limit,
            commands::history::update_recording_retention_period,
            helpers::clamshell::is_laptop,
        ])
        .build()
}
