// Adapted from Handy v0.9.7 (MIT, CJ Pais). See src-tauri/crates/handy-core/LICENSE.
export interface DictationStatus { revision: number; operationId: number; phase: string; ready: boolean; text: string; error: string | null }
export type AppSettings = { 
/**
 * Internal settings schema marker for one-time migrations. Fresh installs
 * start at the current version; existing stores missing this key are
 * treated as version 0 and migrated forward.
 */
settings_schema_version?: number; 
/**
 * Defaults to empty on partial stores; the load path merges in the
 * default bindings for any missing keys before the settings are used.
 */
bindings?: Partial<{ [key in string]: ShortcutBinding }>; 
/**
 * Replaces the pre-0.10 `push_to_talk` bool; stores missing this key are
 * migrated from it in `apply_settings_migrations`.
 */
shortcut_activation?: ShortcutActivation; 
/**
 * Hold-or-toggle only: a press held at least this long is push-to-talk,
 * anything shorter is a tap that locks recording on.
 */
hold_threshold_ms?: number; audio_feedback?: boolean; audio_feedback_volume?: number; sound_theme?: SoundTheme; start_hidden?: boolean; autostart_enabled?: boolean; update_checks_enabled?: boolean; show_whats_new_on_update?: boolean; 
/**
 * The app version whose What's New the user has already seen. Fresh installs
 * default to the current version (nothing is "new" to them). Existing users
 * upgrading from before this key existed are blanked by the migration so they
 * see the current release's notes — see `apply_settings_migrations`.
 */
whats_new_last_seen_version?: string; selected_model?: string; onboarding_completed?: boolean; always_on_microphone?: boolean; selected_microphone?: string | null; 
/**
 * Which input channel to use on the selected microphone device.
 * None means "average all channels" (original behavior).
 */
selected_channel?: number | null; clamshell_microphone?: string | null; selected_output_device?: string | null; translate_to_english?: boolean; selected_language?: string; overlay_position?: OverlayPosition; debug_mode?: boolean; log_level?: LogLevel; custom_words?: string[]; model_unload_timeout?: ModelUnloadTimeout; word_correction_threshold?: number; history_limit?: number; recording_retention_period?: RecordingRetentionPeriod; paste_method?: PasteMethod; clipboard_handling?: ClipboardHandling; auto_submit?: boolean; auto_submit_key?: AutoSubmitKey; post_process_enabled?: boolean; post_process_provider_id?: string; post_process_providers?: PostProcessProvider[]; post_process_models?: Partial<{ [key in string]: string }>; post_process_prompts?: LLMPrompt[]; post_process_selected_prompt_id?: string | null; mute_while_recording?: boolean; append_trailing_space?: boolean; app_language?: string; theme?: Theme; experimental_enabled?: boolean; lazy_stream_close?: boolean; keyboard_implementation?: KeyboardImplementation; show_tray_icon?: boolean; paste_delay_ms?: number; paste_delay_after_ms?: number; 
/**
 * Debug-gated ("beta") receipt-sequenced paste: restore the clipboard only
 * after the target app actually reads the transcript, instead of after a
 * fixed delay. See `paste_tx`. macOS and Windows only.
 */
reliable_paste?: boolean; typing_tool?: TypingTool; external_script_path?: string | null; filler_word_removal_enabled?: boolean; custom_filler_words?: string[] | null; transcribe_accelerator?: TranscribeAcceleratorSetting; ort_accelerator?: OrtAcceleratorSetting; 
/**
 * Stable transcribe.cpp device selector. This is derived from the backend's
 * `device_id` when available (or its name for backends such as Metal),
 * never from the process-local device registry index.
 */
transcribe_gpu_device?: string | null; extra_recording_buffer_ms?: number; vad_enabled?: boolean; 
/**
 * Experimental detector implementation. Silero remains the stable default.
 */
vad_backend?: VadBackend; 
/**
 * Which recording overlay to show: None / Minimal / Live. Streaming mode is
 * not gated on this — that follows model capability. Migrated from the old
 * `overlay_position` (position `none` → style `None`).
 */
overlay_style?: OverlayStyle }
export type AudioDevice = { index: string; name: string; is_default: boolean }
export type AutoSubmitKey = "enter" | "ctrl_enter" | "cmd_enter"
export type AvailableAccelerators = { transcribe: string[]; ort: string[]; gpu_devices: GpuDeviceOption[] }
export type BindingResponse = { success: boolean; binding: ShortcutBinding | null; error: string | null }
export type ClipboardHandling = "dont_modify" | "copy_to_clipboard"
export type CustomSounds = { start: boolean; stop: boolean }
export type EngineType = 
/**
 * Any GGML/GGUF model loaded through transcribe-cpp (Whisper, Parakeet,
 * Voxtral, Qwen3-ASR, Nemotron, …). The architecture is auto-detected from
 * the file, so this one variant covers the whole transcribe-cpp family.
 */
"TranscribeCpp" | "Parakeet" | "Moonshine" | "MoonshineStreaming" | "SenseVoice" | "GigaAM" | "Canary" | "Cohere"
export type GpuDeviceOption = { id: string; name: string; total_vram_mb: number }
export type HistoryEntry = { id: number; file_name: string; timestamp: number; saved: boolean; title: string; transcription_text: string; post_processed_text: string | null; post_process_prompt: string | null; post_process_requested: boolean }
export type HistoryUpdatePayload = { action: "added"; entry: HistoryEntry } | { action: "updated"; entry: HistoryEntry } | { action: "deleted"; id: number } | { action: "toggled"; id: number }
/**
 * Result of changing keyboard implementation
 */
export type ImplementationChangeResult = { success: boolean; 
/**
 * List of binding IDs that were reset to defaults due to incompatibility
 */
reset_bindings: string[] }
export type KeyboardDiagnosticReport = { secure_input_enabled: boolean; culprit_pid: number | null; culprit_name: string | null; 
/**
 * Counts only — key identity is deliberately never captured.
 */
key_down: number; key_up: number; flags_changed: number; mouse: number; duration_ms: number }
export type KeyboardImplementation = "tauri" | "handy_keys"
export type LLMPrompt = { id: string; name: string; prompt: string }
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error"
export type ModelInfo = { id: string; name: string; description: string; filename: string; source: ModelSource; size_mb: number; is_downloaded: boolean; is_downloading: boolean; partial_size: number; is_directory: boolean; engine_type: EngineType; accuracy_score: number; speed_score: number; supports_translation: boolean; is_recommended: boolean; supported_languages: string[]; supports_language_selection: boolean; is_custom: boolean; supports_streaming: boolean; supports_language_detection: boolean }
export type ModelLoadStatus = { is_loaded: boolean; current_model: string | null }
/**
 * Where a model comes from and how Handy obtains it — the routing discriminant
 * for downloading and on-disk resolution.
 */
export type ModelSource = 
/**
 * Direct HTTP download from a URL (current blob.handy.computer hosting).
 */
{ Url: { url: string; 
/**
 * Expected SHA-256 for integrity verification; `None` skips it.
 */
sha256: string | null } } | 
/**
 * A file inside a Hugging Face Hub repo, fetched via hf-hub into the shared
 * HF cache (so other tools reuse it). The file within the repo is
 * [`ModelInfo::filename`].
 */
{ HuggingFace: { repo_id: string; revision: string } } | 
/**
 * Already present on disk — a user-provided custom model, or one discovered
 * in a shared cache. Nothing to download.
 */
"Local"
export type ModelUnloadTimeout = "never" | "immediately" | "min2" | "min5" | "min10" | "min15" | "hour1" | "sec15"
export type OrtAcceleratorSetting = "auto" | "cpu" | "cuda" | "directml" | "rocm"
export type OverlayPosition = "top" | "bottom"
/**
 * Which recording overlay to display. `Minimal` and `Live` share one base
 * (the pill); `Live` grows into the panel that shows live transcription text.
 * `None` hides the overlay entirely. Decoupled from whether the model runs in
 * streaming mode (that is driven purely by model capability).
 */
export type OverlayStyle = "none" | "minimal" | "live"
export type PaginatedHistory = { entries: HistoryEntry[]; has_more: boolean }
export type PasteMethod = "ctrl_v" | "direct" | "none" | "shift_insert" | "ctrl_shift_v" | "external_script"
export type PermissionAccess = "allowed" | "denied" | "unknown"
export type PostProcessProvider = { id: string; label: string; base_url: string; allow_base_url_edit?: boolean; models_endpoint?: string | null; supports_structured_output?: boolean }
export type RecordingRetentionPeriod = "never" | "preserve_limit" | "days3" | "weeks2" | "months3"
export type SecureInputStatus = { 
/**
 * Secure input is currently enabled (live check)
 */
enabled: boolean; 
/**
 * Enabled continuously long enough to be considered stuck (not just a
 * password field gaining momentary focus)
 */
sustained: boolean; culprit_pid: number | null; culprit_name: string | null; 
/**
 * Carbon fallback registrations are currently active
 */
fallback_active: boolean; 
/**
 * Binding ids shadow-registered with identical semantics
 */
covered_bindings: string[]; 
/**
 * Side-specific binding ids widened to match either side while shadowed
 */
degraded_bindings: string[]; 
/**
 * Binding ids that cannot fire at all (e.g. fn+key, registration failure)
 */
uncovered_bindings: string[]; 
/**
 * The user tried to record a shortcut while secure input was active.
 * Treated as user impact even when every binding is covered, so the
 * warning banner appears and explains why recording refused.
 */
recorder_blocked: boolean }
/**
 * How the transcribe shortcut's key events drive a recording.
 */
export type ShortcutActivation = 
/**
 * Press to start, press again to stop.
 */
"toggle" | 
/**
 * Hold to record, release to stop.
 */
"push_to_talk" | 
/**
 * Hold to record and release to stop, or tap to keep recording until the
 * next press. Which one it was is decided by how long the key was held
 * (`hold_threshold_ms`).
 */
"hold_or_toggle"
export type ShortcutBinding = { id: string; name: string; description: string; default_binding: string; current_binding: string }
export type SoundTheme = "marimba" | "pop" | "custom"
/**
 * Phase of the streaming overlay card, emitted to drive its UI state.
 */
export type StreamPhase = 
/**
 * Receiving audio / live text (or waiting for the stream to begin). Rust
 * does not emit this today; the frontend starts in this phase and Rust only
 * emits transitions away from it.
 */
"listening" | 
/**
 * Finalizing or post-processing — show a spinner.
 */
"working"
/**
 * Emitted to switch the streaming overlay to a working spinner.
 */
export type StreamPhaseEvent = { phase: StreamPhase; 
/**
 * Present only when `phase` is `Working`.
 */
kind?: StreamWorkKind | null }
/**
 * Live transcription snapshot emitted to the overlay during a streaming run.
 * `committed` is the append-only, flicker-free prefix; `tentative` is the
 * volatile suffix the model may still rewrite.
 */
export type StreamTextEvent = { committed: string; tentative: string }
/**
 * Semantic kind of "working" phase, used to localize the spinner label.
 */
export type StreamWorkKind = "transcribing" | "polishing"
/**
 * UI appearance mode. `System` follows the OS `prefers-color-scheme`; `Light`
 * and `Dark` force one of the two palettes Handy already ships.
 */
export type Theme = "system" | "light" | "dark"
export type TranscribeAcceleratorSetting = "auto" | "cpu" | "gpu"
export type TypingTool = "auto" | "wtype" | "kwtype" | "dotool" | "ydotool" | "xdotool"
export type VadBackend = "silero" | "earshot"
export type WindowsMicrophonePermissionStatus = { supported: boolean; overall_access: PermissionAccess; device_access: PermissionAccess; app_access: PermissionAccess; desktop_app_access: PermissionAccess }

