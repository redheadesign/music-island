use crate::audio_toolkit::{
    apply_custom_words, detect_output_language, normalize_transcription_output,
    remove_filler_words, OutputLanguageEvidence,
};
use crate::managers::audio::AudioRecordingManager;
use crate::managers::model::ModelManager;
use crate::runtime::{RemoteEngine as LoadedEngine, RunOptions, Task};
use crate::settings::{
    get_settings, AppSettings, ModelUnloadTimeout, TranscribeAcceleratorSetting,
};
use anyhow::Result;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Condvar, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant, SystemTime};
use tauri::{AppHandle, Emitter, Manager};
use tauri_specta::Event;
const STREAM_PERF_LOG_INTERVAL: Duration = Duration::from_secs(5);
const STREAM_FINALIZE_REPLY_TIMEOUT: Duration = Duration::from_secs(30);

fn panic_payload_message(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(message) = payload.downcast_ref::<&str>() {
        (*message).to_string()
    } else if let Some(message) = payload.downcast_ref::<String>() {
        message.clone()
    } else {
        "unknown panic".to_string()
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct ModelStateEvent {
    pub event_type: String,
    pub model_id: Option<String>,
    pub model_name: Option<String>,
    pub error: Option<String>,
}

/// Live transcription snapshot emitted to the overlay during a streaming run.
/// `committed` is the append-only, flicker-free prefix; `tentative` is the
/// volatile suffix the model may still rewrite.
#[derive(Clone, Debug, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct StreamTextEvent {
    pub operation_id: u64,
    pub committed: String,
    pub tentative: String,
}

/// Phase of the streaming overlay card, emitted to drive its UI state.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum StreamPhase {
    /// Receiving audio / live text (or waiting for the stream to begin). Rust
    /// does not emit this today; the frontend starts in this phase and Rust only
    /// emits transitions away from it.
    Listening,
    /// Finalizing or post-processing — show a spinner.
    Working,
}

/// Semantic kind of "working" phase, used to localize the spinner label.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum StreamWorkKind {
    Transcribing,
    Polishing,
}

/// Emitted to switch the streaming overlay to a working spinner.
#[derive(Clone, Debug, Serialize, Deserialize, Type, tauri_specta::Event)]
pub struct StreamPhaseEvent {
    pub phase: StreamPhase,
    /// Present only when `phase` is `Working`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<StreamWorkKind>,
}

/// Commands sent to the streaming worker thread. Audio frames and the finalize
/// request travel the same channel so FIFO ordering guarantees every fed frame
/// is processed before finalize runs.
enum StreamCmd {
    Feed(Vec<f32>),
    /// Flush the stream and reply with the final text, or `None` if no stream
    /// was ever active (caller should fall back to batch transcription).
    Finalize(mpsc::Sender<Option<FinalizedStreamText>>),
    Cancel,
}

struct FinalizedStreamText {
    text: String,
    output_language: OutputLanguageEvidence,
    /// The streaming model's supported languages, for text-based detection.
    supported_languages: Vec<String>,
}

/// Routes real-time audio frames to the active streaming worker. Shared between
/// the [`TranscriptionManager`] (opens/closes the route) and the audio recorder's
/// per-frame callback (feeds frames). The recorder holds an `Arc<StreamRouter>`
/// directly, so a frame with no stream pending costs a single relaxed atomic
/// load — no Tauri state lookup, no mutex lock.
pub struct StreamRouter {
    /// Command channel to the active streaming worker, present from
    /// `start_stream` until `finalize_stream`/`cancel_stream`.
    tx: Mutex<Option<mpsc::Sender<StreamCmd>>>,
    /// True while a stream is pending or active (channel is open). The audio
    /// callback checks this first to avoid the mutex lock when no stream runs.
    open: Arc<AtomicBool>,
}

impl StreamRouter {
    fn new() -> Self {
        Self {
            tx: Mutex::new(None),
            open: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Open a fresh command channel for a new streaming session, returning the
    /// receiver the worker should drain. Caller must ensure no prior channel is
    /// still open.
    fn open(&self) -> mpsc::Receiver<StreamCmd> {
        let (tx, rx) = mpsc::channel::<StreamCmd>();
        *self.tx.lock().unwrap() = Some(tx);
        self.open.store(true, Ordering::Relaxed);
        rx
    }

    /// Take the sender out (closing the channel to new feeds). Returns the
    /// sender so the caller can send the final `Finalize`/`Cancel` command.
    fn take(&self) -> Option<mpsc::Sender<StreamCmd>> {
        self.open.store(false, Ordering::Relaxed);
        self.tx.lock().unwrap().take()
    }

    /// Drop the channel and mark closed without sending a final command (used
    /// when the worker exits without a finalize/cancel handshake).
    fn clear(&self) {
        self.open.store(false, Ordering::Relaxed);
        *self.tx.lock().unwrap() = None;
    }

    /// Forward a 16 kHz frame to the active streaming worker. Cheap no-op (a
    /// single relaxed atomic load) when no stream is pending.
    pub fn feed(&self, frame: &[f32]) {
        if !self.open.load(Ordering::Relaxed) {
            return;
        }
        if let Some(tx) = self.tx.lock().unwrap().as_ref() {
            let _ = tx.send(StreamCmd::Feed(frame.to_vec()));
        }
    }

    /// Whether a stream is pending or active.
    pub fn is_open(&self) -> bool {
        self.open.load(Ordering::Relaxed)
    }
}

/// RAII guard that clears the `is_loading` flag and notifies waiters on drop.
/// Ensures the loading flag is always reset, even on early returns or panics.
pub struct LoadingGuard {
    is_loading: Arc<Mutex<bool>>,
    loading_condvar: Arc<Condvar>,
}

impl Drop for LoadingGuard {
    fn drop(&mut self) {
        // Recover from a poisoned mutex instead of panicking —
        // a panic inside Drop calls abort().
        let mut is_loading = match self.is_loading.lock() {
            Ok(g) => g,
            Err(e) => {
                warn!("Recovered poisoned is_loading mutex during LoadingGuard drop — a panic occurred earlier this session");
                e.into_inner()
            }
        };
        *is_loading = false;
        self.loading_condvar.notify_all();
    }
}

/// RAII guard that clears the streaming worker/lease flags on any worker exit -
/// normal return, early return, or a panic in an engine call that unwinds the
/// detached worker thread. Tokens prevent an older worker from clearing a newer
/// worker's state if a start/finalize race ever slips through.
struct StreamWorkerGuard {
    worker_id: u64,
    active_stream_worker: Arc<AtomicU64>,
    active_engine_lease: Arc<AtomicU64>,
    stream_active: Arc<AtomicBool>,
}

impl Drop for StreamWorkerGuard {
    fn drop(&mut self) {
        if self.active_stream_worker.load(Ordering::Acquire) == self.worker_id {
            self.stream_active.store(false, Ordering::Release);
        }
        let _ = self.active_engine_lease.compare_exchange(
            self.worker_id,
            0,
            Ordering::AcqRel,
            Ordering::Acquire,
        );
        let _ = self.active_stream_worker.compare_exchange(
            self.worker_id,
            0,
            Ordering::AcqRel,
            Ordering::Acquire,
        );
    }
}

#[derive(Clone)]
pub struct TranscriptionManager {
    engine: Arc<Mutex<Option<LoadedEngine>>>,
    model_manager: Arc<ModelManager>,
    app_handle: AppHandle,
    current_model_id: Arc<Mutex<Option<String>>>,
    last_activity: Arc<AtomicU64>,
    shutdown_signal: Arc<AtomicBool>,
    watcher_handle: Arc<Mutex<Option<thread::JoinHandle<()>>>>,
    is_loading: Arc<Mutex<bool>>,
    loading_condvar: Arc<Condvar>,
    reload_model_on_next_use: Arc<AtomicBool>,
    /// Routes real-time audio frames to the active streaming worker; see
    /// [`StreamRouter`]. Shared with the audio recorder so per-frame feeds skip
    /// Tauri state and the manager lock.
    router: Arc<StreamRouter>,
    /// True only while a transcribe-cpp `Stream` is actually in flight (set by
    /// the worker once `stream()` succeeds). Used for overlay/UI decisions.
    stream_active: Arc<AtomicBool>,
    /// Streaming uses four independent flags: router open = frames should route,
    /// worker active = no second worker may start, engine lease = engine is out
    /// of the mutex, stream active = UI should show a live session.
    ///
    /// Monotonic id source for stream workers; zero means "no worker".
    next_stream_worker_id: Arc<AtomicU64>,
    /// Nonzero while a stream worker exists, even if it has not leased the engine
    /// yet. This prevents a second worker from starting after finalize/cancel
    /// closes the router but before the first worker has fully exited.
    active_stream_worker: Arc<AtomicU64>,
    /// Nonzero while the streaming worker has taken the engine out of `engine`.
    /// `is_model_loaded()` consults this so the model still reports "loaded"
    /// while the worker holds it.
    active_engine_lease: Arc<AtomicU64>,
}

impl TranscriptionManager {
    pub fn new(app_handle: &AppHandle, model_manager: Arc<ModelManager>) -> Result<Self> {
        let manager = Self {
            engine: Arc::new(Mutex::new(None)),
            model_manager,
            app_handle: app_handle.clone(),
            current_model_id: Arc::new(Mutex::new(None)),
            last_activity: Arc::new(AtomicU64::new(Self::now_ms())),
            shutdown_signal: Arc::new(AtomicBool::new(false)),
            watcher_handle: Arc::new(Mutex::new(None)),
            is_loading: Arc::new(Mutex::new(false)),
            loading_condvar: Arc::new(Condvar::new()),
            reload_model_on_next_use: Arc::new(AtomicBool::new(false)),
            router: Arc::new(StreamRouter::new()),
            stream_active: Arc::new(AtomicBool::new(false)),
            next_stream_worker_id: Arc::new(AtomicU64::new(1)),
            active_stream_worker: Arc::new(AtomicU64::new(0)),
            active_engine_lease: Arc::new(AtomicU64::new(0)),
        };

        // Start the idle watcher
        {
            let app_handle_cloned = app_handle.clone();
            let manager_cloned = manager.clone();
            let shutdown_signal = manager.shutdown_signal.clone();
            let handle = thread::spawn(move || {
                debug!("Idle watcher thread started");
                while !shutdown_signal.load(Ordering::Relaxed) {
                    thread::park_timeout(Duration::from_secs(10));

                    // Check shutdown signal again after sleep
                    if shutdown_signal.load(Ordering::Relaxed) {
                        break;
                    }

                    let settings = get_settings(&app_handle_cloned);
                    let timeout = settings.model_unload_timeout;

                    // Skip Immediately — that variant is handled by
                    // maybe_unload_immediately() after each transcription.
                    // Treating it as 0s here would unload the model mid-recording.
                    if timeout == ModelUnloadTimeout::Immediately {
                        continue;
                    }

                    // While recording, keep the idle timer fresh so the
                    // model is never unloaded mid-session.
                    let is_recording = app_handle_cloned
                        .try_state::<Arc<AudioRecordingManager>>()
                        .is_some_and(|a| a.is_recording());
                    if is_recording {
                        manager_cloned.touch_activity();
                        continue;
                    }

                    if let Some(limit_seconds) = timeout.to_seconds() {
                        let last = manager_cloned.last_activity.load(Ordering::Relaxed);
                        let now_ms = TranscriptionManager::now_ms();
                        let idle_ms = now_ms.saturating_sub(last);
                        let limit_ms = limit_seconds * 1000;

                        if idle_ms > limit_ms {
                            // idle -> unload
                            if manager_cloned.is_model_loaded() {
                                let unload_start = std::time::Instant::now();
                                info!(
                                    "Model idle for {}s (limit: {}s), unloading",
                                    idle_ms / 1000,
                                    limit_seconds
                                );
                                match manager_cloned.unload_model() {
                                    Ok(()) => {
                                        let unload_duration = unload_start.elapsed();
                                        info!(
                                            "Model unloaded due to inactivity (took {}ms)",
                                            unload_duration.as_millis()
                                        );
                                    }
                                    Err(e) => {
                                        error!("Failed to unload idle model: {}", e);
                                    }
                                }
                            }
                        }
                    }
                }
                debug!("Idle watcher thread shutting down gracefully");
            });
            *manager.watcher_handle.lock().unwrap() = Some(handle);
        }

        Ok(manager)
    }

    /// Lock the engine mutex, recovering from poison if a previous transcription panicked.
    pub fn stop_idle_watcher(&self) {
        self.shutdown_signal.store(true, Ordering::Release);
        let handle = self.watcher_handle.lock().unwrap_or_else(|e| e.into_inner()).take();
        if let Some(handle) = handle {
            handle.thread().unpark();
            if handle.thread().id() != thread::current().id() {
                let _ = handle.join();
            }
        }
    }

    fn lock_engine(&self) -> MutexGuard<'_, Option<LoadedEngine>> {
        self.engine.lock().unwrap_or_else(|poisoned| {
            warn!("Engine mutex was poisoned by a previous panic, recovering");
            poisoned.into_inner()
        })
    }

    pub fn is_model_loaded(&self) -> bool {
        // The engine may be leased out to the streaming worker (taken out of
        // the mutex). It's still loaded, just in use, so report true.
        self.lock_engine().is_some() || self.active_engine_lease.load(Ordering::Acquire) != 0
    }

    /// Accelerator changes should not disturb the current transcription. Mark
    /// the cached engine stale; the next model-use path reloads it with the
    /// latest settings.
    pub fn reload_model_on_next_use(&self) {
        self.reload_model_on_next_use.store(true, Ordering::Release);
    }

    /// Atomically check whether a model load is in progress and, if not, mark
    /// one as starting. Returns a [`LoadingGuard`] whose [`Drop`] impl will
    /// clear the flag and wake waiters. Returns `None` if a load is already in
    /// progress.
    pub fn try_start_loading(&self) -> Option<LoadingGuard> {
        let mut is_loading = self.is_loading.lock().unwrap();
        if *is_loading {
            return None;
        }
        *is_loading = true;
        Some(LoadingGuard {
            is_loading: self.is_loading.clone(),
            loading_condvar: self.loading_condvar.clone(),
        })
    }

    pub fn unload_model(&self) -> Result<()> {
        let unload_start = std::time::Instant::now();
        debug!("Starting to unload model");

        {
            let mut engine = self.lock_engine();
            // Dropping the engine frees all resources
            *engine = None;
        }
        {
            let mut current_model = self.current_model_id.lock().unwrap();
            *current_model = None;
        }

        // Emit unloaded event
        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "unloaded".to_string(),
                model_id: None,
                model_name: None,
                error: None,
            },
        );

        let unload_duration = unload_start.elapsed();
        debug!(
            "Model unloaded manually (took {}ms)",
            unload_duration.as_millis()
        );
        Ok(())
    }

    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64
    }

    /// Reset the idle timer to now.
    fn touch_activity(&self) {
        self.last_activity.store(Self::now_ms(), Ordering::Relaxed);
    }

    /// Unloads the model immediately if the setting is enabled and the model is loaded
    pub fn maybe_unload_immediately(&self, context: &str) {
        let settings = get_settings(&self.app_handle);
        if settings.model_unload_timeout == ModelUnloadTimeout::Immediately
            && self.is_model_loaded()
        {
            info!("Immediately unloading model after {}", context);
            if let Err(e) = self.unload_model() {
                warn!("Failed to immediately unload model: {}", e);
            }
        }
    }

    pub fn load_model(&self, model_id: &str) -> Result<()> {
        self.load_model_with_device(model_id, None)
    }

    /// Like [`load_model`](Self::load_model), but lets a caller hard-select the
    /// compute device for this one load by its `transcribe_cpp::devices()`
    /// registry index (the index shown by `--list-devices`). `None` keeps the
    /// persisted accelerator setting (which may be Auto). Only affects
    /// transcribe-cpp (whisper-family) models; the selection is not persisted.
    pub fn load_model_with_device(
        &self,
        model_id: &str,
        device_index: Option<usize>,
    ) -> Result<()> {
        apply_accelerator_settings(&self.app_handle);

        let load_start = std::time::Instant::now();
        debug!("Starting to load model: {}", model_id);

        // Emit loading started event
        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "loading_started".to_string(),
                model_id: Some(model_id.to_string()),
                model_name: None,
                error: None,
            },
        );

        let model_info = match self.model_manager.get_model_info(model_id) {
            Some(model_info) => model_info,
            None => {
                let error_msg = format!("Model not found: {}", model_id);
                let _ = self.app_handle.emit(
                    "model-state-changed",
                    ModelStateEvent {
                        event_type: "loading_failed".to_string(),
                        model_id: Some(model_id.to_string()),
                        model_name: None,
                        error: Some(error_msg.clone()),
                    },
                );
                return Err(anyhow::anyhow!(error_msg));
            }
        };

        // Every failure after loading starts must emit a terminal event so the
        // frontend can never remain in its loading state.
        let emit_loading_failed = |error_msg: &str| {
            let _ = self.app_handle.emit(
                "model-state-changed",
                ModelStateEvent {
                    event_type: "loading_failed".to_string(),
                    model_id: Some(model_id.to_string()),
                    model_name: Some(model_info.name.clone()),
                    error: Some(error_msg.to_string()),
                },
            );
        };

        if !model_info.is_downloaded {
            let error_msg = "Model not downloaded";
            emit_loading_failed(error_msg);
            return Err(anyhow::anyhow!(error_msg));
        }

        let model_path = self
            .model_manager
            .get_model_path(model_id)
            .inspect_err(|error| emit_loading_failed(&error.to_string()))?;

        // Drop the current engine BEFORE building the new one so transcribe-cpp
        // frees the previous native context first — avoids holding two models at
        // once (peak memory on large GGUFs). Clear the id too: if the new load
        // fails, status should read "no loaded model", not the dropped engine.
        {
            let mut engine = self.lock_engine();
            *engine = None;
        }
        {
            let mut current_model = self.current_model_id.lock().unwrap();
            *current_model = None;
        }

        // Create appropriate engine based on model type

        let settings = get_settings(&self.app_handle);
        let kind = serde_json::to_value(&model_info.engine_type)?
            .as_str()
            .unwrap()
            .to_string();
        let accelerator = serde_json::to_value(settings.transcribe_accelerator)?
            .as_str()
            .unwrap()
            .to_string();
        let loaded_engine = LoadedEngine::load(
            &model_path,
            kind,
            accelerator,
            settings.transcribe_gpu_device,
            device_index,
            transcribe_gpu_disabled_for_host(),
        )
        .inspect_err(|e| emit_loading_failed(&e.to_string()))?;
        if loaded_engine.kind == "TranscribeCpp" {
            let caps = &loaded_engine.capabilities;
            self.model_manager.set_runtime_capabilities(
                model_id,
                caps.streaming,
                caps.translate,
                caps.language_detection,
                caps.languages.clone(),
            );
        }

        // Update the current engine and model ID
        {
            let mut engine = self.lock_engine();
            if !crate::is_enabled() {
                anyhow::bail!("Dictation was disabled while the model was loading");
            }
            *engine = Some(loaded_engine);
            let mut current_model = self.current_model_id.lock().unwrap();
            *current_model = Some(model_id.to_string());
        }

        // Reset idle timer so the watcher doesn't immediately unload a just-loaded model
        self.touch_activity();

        // Emit loading completed event
        let _ = self.app_handle.emit(
            "model-state-changed",
            ModelStateEvent {
                event_type: "loading_completed".to_string(),
                model_id: Some(model_id.to_string()),
                model_name: Some(model_info.name.clone()),
                error: None,
            },
        );

        let load_duration = load_start.elapsed();
        debug!(
            "Successfully loaded transcription model: {} (took {}ms)",
            model_id,
            load_duration.as_millis()
        );
        Ok(())
    }

    /// Kicks off the model loading in a background thread if it's not already loaded
    pub fn initiate_model_load(&self) {
        let mut is_loading = self.is_loading.lock().unwrap();
        if *is_loading {
            return;
        }

        let reload_pending = self.reload_model_on_next_use.load(Ordering::Acquire);
        if !reload_pending && self.is_model_loaded() {
            return;
        }

        *is_loading = true;
        let self_clone = self.clone();
        thread::spawn(move || {
            if reload_pending {
                self_clone
                    .reload_model_on_next_use
                    .store(false, Ordering::Release);
            }
            let settings = get_settings(&self_clone.app_handle);
            if let Err(e) = self_clone.load_model(&settings.selected_model) {
                error!("Failed to load model: {}", e);
            }
            let mut is_loading = self_clone.is_loading.lock().unwrap();
            *is_loading = false;
            self_clone.loading_condvar.notify_all();
        });
    }

    pub fn get_current_model(&self) -> Option<String> {
        let current_model = self.current_model_id.lock().unwrap();
        current_model.clone()
    }

    /// The compute backend the currently-loaded engine is bound to, for
    /// diagnostics (e.g. confirming `--device-index` actually bound a GPU rather
    /// than falling back to CPU/auto). transcribe-cpp (whisper-family) reports
    /// its real backend string; ONNX engines report "onnx"; `None` when no
    /// model is loaded.
    pub fn current_backend(&self) -> Option<String> {
        self.lock_engine()
            .as_ref()
            .map(|engine| engine.capabilities.backend.clone())
    }

    /// Whether a live streaming run is currently in flight.
    pub fn is_streaming(&self) -> bool {
        self.stream_active.load(Ordering::Acquire)
    }

    /// Shared handle to the stream router, used by the audio recorder to feed
    /// real-time frames without going through Tauri state on every frame.
    pub fn stream_router(&self) -> Arc<StreamRouter> {
        Arc::clone(&self.router)
    }

    /// Begin a live streaming transcription on the held engine's session.
    /// Audio frames pushed via [`StreamRouter::feed`] (captured directly by the
    /// audio recorder) are decoded incrementally and emitted to the overlay as
    /// [`StreamTextEvent`].
    ///
    /// Non-blocking: spawns a worker that waits for any in-progress model load,
    /// verifies the model supports streaming, then begins the stream. If the
    /// model can't stream, the worker idles until finalize/cancel and reports
    /// `None` so the caller falls back to batch transcription. Frames sent
    /// before the stream begins queue on the channel and are not lost.
    pub fn start_stream(&self) {
        if self.router.is_open() || self.active_stream_worker.load(Ordering::Acquire) != 0 {
            warn!("start_stream called while a stream worker is already active");
            return;
        }
        let worker_id = self.next_stream_worker_id.fetch_add(1, Ordering::Relaxed);
        if self
            .active_stream_worker
            .compare_exchange(0, worker_id, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            warn!("start_stream lost a race with another stream worker");
            return;
        }
        let rx = self.router.open();
        self.stream_active.store(false, Ordering::Release);

        let manager = self.clone();
        let operation_id = crate::status::snapshot().operation_id;
        thread::spawn(move || manager.run_stream_worker(rx, worker_id, operation_id));
    }

    fn run_stream_worker(&self, rx: mpsc::Receiver<StreamCmd>, worker_id: u64, operation_id: u64) {
        let _worker = StreamWorkerGuard {
            worker_id,
            active_stream_worker: Arc::clone(&self.active_stream_worker),
            active_engine_lease: Arc::clone(&self.active_engine_lease),
            stream_active: Arc::clone(&self.stream_active),
        };

        // Wait for any in-progress model load to finish (start_stream races the
        // background load kicked off when recording starts).
        {
            let mut is_loading = self.is_loading.lock().unwrap();
            while *is_loading {
                is_loading = self.loading_condvar.wait(is_loading).unwrap();
            }
        }

        let model_id = self.get_current_model().unwrap_or_default();

        // Take the engine out of the mutex so we own it during streaming,
        // structurally excluding any concurrent batch transcription (which
        // transcribe-cpp's compute_lock would refuse anyway). Returned when the
        // worker exits, or dropped if the model was switched/unloaded mid-stream.
        if self
            .active_engine_lease
            .compare_exchange(0, worker_id, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            warn!("Live preview: another worker already holds the transcription engine");
            self.router.clear();
            drain_until_finalize(rx);
            return;
        }
        let mut engine = match self.lock_engine().take() {
            Some(e) => e,
            None => {
                info!(
                    "Live preview: model '{}' was unloaded before streaming could begin; \
                     falling back to batch transcription",
                    model_id
                );
                let _ = self.active_engine_lease.compare_exchange(
                    worker_id,
                    0,
                    Ordering::AcqRel,
                    Ordering::Acquire,
                );
                self.router.clear();
                drain_until_finalize(rx);
                return;
            }
        };

        // Only transcribe-cpp models expose streaming; ONNX engines fall back to
        // batch. The loaded session (not the ModelManager copy) is the source of
        // truth for run-path capabilities.
        let supports_streaming = engine.capabilities.streaming;
        let supports_translate = engine.capabilities.translate;
        let languages = engine.capabilities.languages.clone();

        if !supports_streaming {
            self.return_engine(engine, &model_id);
            self.router.clear();
            drain_until_finalize(rx);
            return;
        }

        // Build run options mirroring the offline transcribe-cpp path: task +
        // language gated against what the model actually advertises.
        let settings = get_settings(&self.app_handle);
        let effective_language =
            effective_language_for_model(&settings, self.model_manager.as_ref(), &model_id);
        let run_plan = transcribe_cpp_run_plan(
            settings.translate_to_english,
            &effective_language,
            &languages,
            supports_translate,
        );
        let output_language = resolve_output_language_evidence(
            &settings,
            run_plan.language.as_deref(),
            &languages,
            run_plan.target_language.as_deref() == Some("en"),
        );
        let run_options = RunOptions {
            translate: run_plan.task == Task::Translate,
            language: run_plan.language,
            target_language: run_plan.target_language,
            ..Default::default()
        };

        // Run the stream on the held session. The Stream borrows the session
        // (and thus the engine) for its lifetime, so the feed/finalize loop
        // lives in a labeled block — when it exits, the borrow is released and
        // the engine can be moved into return_engine().
        let mut finalize_reply: Option<mpsc::Sender<Option<FinalizedStreamText>>> = None;
        let mut finalize_result: Option<Option<FinalizedStreamText>> = None;
        let stream_started = 'stream: {
            let backend = engine.capabilities.backend.clone();
            let mut stream = match engine.stream(run_options) {
                Ok(s) => s,
                Err(e) => {
                    error!("Failed to begin stream: {}", e);
                    break 'stream false;
                }
            };

            self.stream_active.store(true, Ordering::Release);
            self.touch_activity();
            info!(
                "Live streaming transcription started (model '{}', backend '{}')",
                model_id, backend
            );

            let mut perf = StreamPerf::new();
            while let Ok(cmd) = rx.recv() {
                match cmd {
                    StreamCmd::Feed(pcm) => {
                        self.touch_activity();
                        perf.record_feed(pcm.len());
                        let feed_start = Instant::now();
                        match stream.feed(&pcm) {
                            Ok(update) => {
                                perf.record_compute(feed_start.elapsed());
                                perf.record_update(
                                    update.revision as i32,
                                    update.input_received_ms as i64,
                                    update.audio_committed_ms as i64,
                                    update.buffered_ms as i64,
                                );
                                if update.committed_changed || update.tentative_changed {
                                    let text = stream.text();
                                    perf.record_emit();
                                    self.emit_stream_text(
                                        operation_id,
                                        &text.committed,
                                        &text.tentative,
                                    );
                                }
                                perf.maybe_log();
                            }
                            Err(e) => {
                                perf.record_compute(feed_start.elapsed());
                                warn!("stream feed failed: {}", e);
                            }
                        }
                    }
                    StreamCmd::Finalize(reply) => {
                        let finalize_start = Instant::now();
                        let result = match stream.finalize() {
                            // After finalize the committed prefix holds the full
                            // text; display() = committed + tentative is the safe read.
                            Ok(update) => {
                                perf.record_compute(finalize_start.elapsed());
                                perf.record_update(
                                    update.revision as i32,
                                    update.input_received_ms as i64,
                                    update.audio_committed_ms as i64,
                                    update.buffered_ms as i64,
                                );
                                // In auto mode the model's own LID is the best
                                // remaining evidence; the snapshot is only
                                // materialized when it can change the outcome.
                                let output_language = match &output_language {
                                    OutputLanguageEvidence::Unknown => {
                                        with_model_detected_language(
                                            OutputLanguageEvidence::Unknown,
                                            stream.snapshot().language,
                                        )
                                    }
                                    resolved => resolved.clone(),
                                };
                                Some(FinalizedStreamText {
                                    text: stream.text().full,
                                    output_language,
                                    supported_languages: languages.clone(),
                                })
                            }
                            Err(e) => {
                                perf.record_compute(finalize_start.elapsed());
                                error!(
                                    "stream finalize failed: {}; falling back to batch transcription",
                                    e
                                );
                                None
                            }
                        };
                        let chars = match &result {
                            Some(finalized) => finalized.text.len(),
                            _ => 0,
                        };
                        perf.log_finalized(chars);
                        finalize_reply = Some(reply);
                        finalize_result = Some(result);
                        break;
                    }
                    StreamCmd::Cancel => {
                        stream.reset();
                        break;
                    }
                }
            }

            true
        };
        // `stream` + the `&mut engine` borrow are released here.

        if !stream_started {
            // Stream never began (model doesn't support streaming or begin
            // failed); drain so the finalize handshake still completes and the
            // caller falls back to batch transcription. Return the engine first
            // so the fallback can immediately use it.
            self.return_engine(engine, &model_id);
            drain_until_finalize(rx);
            return;
        }

        self.return_engine(engine, &model_id);
        if let (Some(reply), Some(result)) = (finalize_reply, finalize_result) {
            let _ = reply.send(result);
        }
        // `_worker` drops here, clearing this worker's active/lease flags after
        // the engine has been returned to the pool.
    }

    /// Return the leased engine to the mutex, unless the model was switched or
    /// unloaded during transcription (in which case the stale engine is dropped).
    fn return_engine(&self, engine: LoadedEngine, expected_model_id: &str) {
        if !crate::is_enabled() || !engine.is_healthy() {
            *self
                .current_model_id
                .lock()
                .unwrap_or_else(|e| e.into_inner()) = None;
            return;
        }
        let still_current =
            self.current_model_id.lock().unwrap().as_deref() == Some(expected_model_id);
        if still_current {
            *self.lock_engine() = Some(engine);
        } else {
            info!(
                "Model changed/unloaded during transcription; dropping stale engine (was '{}')",
                expected_model_id
            );
            // `engine` drops here, freeing its resources.
        }
    }

    /// Flush the active stream and return its final, post-filtered text.
    ///
    /// `Ok(None)` means no usable stream was active and the caller may fall back
    /// to batch transcription. `Err` means finalize itself failed or timed out.
    /// A timeout may still leave the worker holding the engine, so callers
    /// should surface it instead of immediately starting a batch fallback.
    pub fn finalize_stream(&self) -> Result<Option<String>> {
        let Some(tx) = self.router.take() else {
            return Ok(None);
        };
        let (reply_tx, reply_rx) = mpsc::channel();
        if tx.send(StreamCmd::Finalize(reply_tx)).is_err() {
            return Ok(None);
        }
        let finalized = match reply_rx.recv_timeout(STREAM_FINALIZE_REPLY_TIMEOUT) {
            Ok(Some(finalized)) => finalized,
            Ok(None) => return Ok(None),
            Err(mpsc::RecvTimeoutError::Disconnected) => return Ok(None),
            Err(mpsc::RecvTimeoutError::Timeout) => {
                self.stream_active.store(false, Ordering::Release);
                return Err(anyhow::anyhow!(
                    "Timed out waiting {:?} for live transcription to finalize",
                    STREAM_FINALIZE_REPLY_TIMEOUT
                ));
            }
        };

        let settings = get_settings(&self.app_handle);
        // Streaming models do not receive a decode prompt, so custom words
        // always go through the shared fuzzy post-correction path.
        let filtered = post_process_transcription_text(
            finalized.text,
            &settings,
            false,
            &finalized.output_language,
            &finalized.supported_languages,
        );

        self.maybe_unload_immediately("streaming transcription");
        Ok(Some(filtered))
    }

    /// Abandon any active stream without producing text (e.g. on cancel).
    pub fn cancel_stream(&self) {
        if let Some(tx) = self.router.take() {
            let _ = tx.send(StreamCmd::Cancel);
        }
        self.stream_active.store(false, Ordering::Release);
    }

    /// Emit a working-phase event to the streaming overlay (spinner + label).
    pub fn emit_stream_working(&self, kind: StreamWorkKind) {
        crate::status::phase(
            &self.app_handle,
            match kind {
                StreamWorkKind::Transcribing => "transcribing",
                StreamWorkKind::Polishing => "processing",
            },
        );
        let _ = StreamPhaseEvent {
            phase: StreamPhase::Working,
            kind: Some(kind),
        }
        .emit(&self.app_handle);
    }

    fn emit_stream_text(&self, operation_id: u64, committed: &str, tentative: &str) {
        if crate::status::snapshot().operation_id != operation_id {
            return;
        }
        let _ = StreamTextEvent {
            operation_id,
            committed: committed.to_string(),
            tentative: tentative.to_string(),
        }
        .emit(&self.app_handle);
    }

    pub fn transcribe(&self, audio: Vec<f32>) -> Result<String> {
        #[cfg(debug_assertions)]
        if std::env::var("HANDY_FORCE_TRANSCRIPTION_FAILURE").is_ok() {
            return Err(anyhow::anyhow!(
                "Simulated transcription failure (HANDY_FORCE_TRANSCRIPTION_FAILURE)"
            ));
        }

        // Update last activity timestamp
        self.touch_activity();

        let st = std::time::Instant::now();
        let audio_len = audio.len();

        debug!("Audio vector length: {}", audio_len);

        if audio.is_empty() {
            debug!("Empty audio vector");
            self.maybe_unload_immediately("empty audio");
            return Ok(String::new());
        }

        // Check if model is loaded, if not try to load it
        {
            // If the model is loading, wait for it to complete.
            let mut is_loading = self.is_loading.lock().unwrap();
            while *is_loading {
                is_loading = self.loading_condvar.wait(is_loading).unwrap();
            }

            let engine_guard = self.lock_engine();
            if engine_guard.is_none() {
                return Err(anyhow::anyhow!("Model is not loaded for transcription."));
            }
        }

        // Get current settings for configuration
        let settings = get_settings(&self.app_handle);

        // Validate selected language against the model's supported languages.
        // If the language isn't supported, fall back to "auto" to prevent errors.
        // Validate against the model that's actually loaded (which can differ
        // from settings.selected_model when a caller loaded a specific model —
        // e.g. the --transcribe-file path's --model), not the persisted
        // selection.
        let active_model = self
            .get_current_model()
            .unwrap_or_else(|| settings.selected_model.clone());
        // Resolve the persisted language *intent* into the language this model
        // will actually use. The coercion is capability-aware (a must-pick model
        // never receives "auto") and computed fresh here — it is never written
        // back to settings, so the intent survives switching models and back.
        let validated_language =
            effective_language_for_model(&settings, self.model_manager.as_ref(), &active_model);
        if validated_language != settings.selected_language {
            debug!(
                "Language intent '{}' resolved to '{}' for model '{}'",
                settings.selected_language, validated_language, active_model
            );
        }

        // Whether the loaded transcribe-cpp model advertises
        // Feature::InitialPrompt. Informational (logged below); the whisper
        // run extension and the fuzzy-correction skip are gated on
        // `model_is_whisper` instead, since non-whisper archs can advertise
        // the feature while rejecting the whisper-kind extension.
        // Whether the loaded model is actually whisper-family (arch string).
        // Non-whisper archs (e.g. Voxtral Small) can advertise
        // Feature::InitialPrompt yet reject the whisper-kind run extension
        // with INVALID_ARG, so the whisper extension must be gated on the
        // arch, not on the feature (see #1601).
        let mut model_is_whisper = false;

        // Perform transcription with the appropriate engine.
        // We use catch_unwind to prevent engine panics from poisoning the mutex,
        // which would make the app hang indefinitely on subsequent operations.
        let (result, output_language, model_languages) = {
            let mut engine_guard = self.lock_engine();

            // Take the engine out so we own it during transcription.
            // If the engine panics, we simply don't put it back (effectively unloading it)
            // instead of poisoning the mutex.
            let mut engine = match engine_guard.take() {
                Some(e) => e,
                None => {
                    return Err(anyhow::anyhow!(
                        "Model failed to load after auto-load attempt. Please check your model settings."
                    ));
                }
            };

            // Release the lock before transcribing — no mutex held during the engine call
            drop(engine_guard);

            // Probe live transcribe-cpp capabilities once (cheap GGUF-metadata
            // reads); the loaded session is the source of truth, not the
            // ModelManager copy. The whisper run extension is kind-tagged, so
            // non-whisper archs (parakeet, voxtral, …) reject it with
            // INVALID_ARG; attach it — and translate — only where supported.
            let mut model_languages = self
                .model_manager
                .get_model_info(&active_model)
                .map(|info| info.supported_languages)
                .unwrap_or_default();
            let mut output_was_translated = false;
            let mut applied_language_hint: Option<String> = None;
            let mut model_detected_language: Option<String> = None;
            let caps = &engine.capabilities;
            let mut options = RunOptions::default();
            match engine.kind.as_str() {
                "TranscribeCpp" => {
                    model_is_whisper = caps.arch == "whisper";
                    model_languages = caps.languages.clone();
                    let plan = transcribe_cpp_run_plan(
                        settings.translate_to_english,
                        &validated_language,
                        &model_languages,
                        caps.translate,
                    );
                    output_was_translated = plan.target_language.as_deref() == Some("en");
                    applied_language_hint = plan.language.clone();
                    options.language = plan.language;
                    options.target_language = plan.target_language;
                    if model_is_whisper && !settings.custom_words.is_empty() {
                        options.initial_prompt = Some(settings.custom_words.join(", "));
                    }
                }
                "SenseVoice" => {
                    options.language = match normalize_cjk_language(&validated_language) {
                        "zh" | "en" | "ja" | "ko" | "yue" => {
                            Some(normalize_cjk_language(&validated_language).to_string())
                        }
                        _ => None,
                    };
                    applied_language_hint = options.language.clone();
                }
                "Canary" => {
                    options.language =
                        (validated_language != "auto").then(|| validated_language.clone());
                    applied_language_hint = options.language.clone();
                    options.translate = settings.translate_to_english;
                    output_was_translated = settings.translate_to_english;
                }
                "Cohere" => {
                    options.language = (validated_language != "auto")
                        .then(|| normalize_cjk_language(&validated_language).to_string());
                    applied_language_hint = options.language.clone();
                }
                _ => {}
            }
            let transcribe_result = catch_unwind(AssertUnwindSafe(|| -> Result<String> {
                let result = engine.run(&audio, options)?;
                model_detected_language = result.language;
                Ok(result.full)
            }));

            let text = match transcribe_result {
                Ok(inner_result) => {
                    // Success or normal error: return the engine unless a model
                    // switch/unload invalidated it while it was in use.
                    self.return_engine(engine, &active_model);
                    inner_result?
                }
                Err(panic_payload) => {
                    // Engine panicked — do NOT put it back (it's in an unknown state).
                    // The engine is dropped here, effectively unloading it.
                    let panic_msg = panic_payload_message(panic_payload.as_ref());
                    error!(
                        "Transcription engine panicked: {}. Model has been unloaded.",
                        panic_msg
                    );

                    // Clear the model ID so it will be reloaded on next attempt
                    {
                        let mut current_model = self
                            .current_model_id
                            .lock()
                            .unwrap_or_else(|e| e.into_inner());
                        *current_model = None;
                    }

                    let _ = self.app_handle.emit(
                        "model-state-changed",
                        ModelStateEvent {
                            event_type: "unloaded".to_string(),
                            model_id: None,
                            model_name: None,
                            error: Some(format!("Engine panicked: {}", panic_msg)),
                        },
                    );

                    return Err(anyhow::anyhow!(
                        "Transcription engine panicked: {}. The model has been unloaded and will reload on next attempt.",
                        panic_msg
                    ));
                }
            };

            let output_language = with_model_detected_language(
                resolve_output_language_evidence(
                    &settings,
                    applied_language_hint.as_deref(),
                    &model_languages,
                    output_was_translated,
                ),
                model_detected_language,
            );
            debug!("Output language evidence: {:?}", output_language);

            (text, output_language, model_languages)
        };

        // Apply fuzzy word correction if custom words are configured — UNLESS the
        // words were already handed to the model as an initial prompt (whisper
        // family). We don't pass a prompt to non-whisper models (it requires the
        // whisper-kind run extension), so they still get fuzzy correction here,
        // same as the ONNX engines.
        let filtered_result = post_process_transcription_text(
            result,
            &settings,
            model_is_whisper,
            &output_language,
            &model_languages,
        );

        let et = std::time::Instant::now();
        let translation_note = if settings.translate_to_english {
            " (translated)"
        } else {
            ""
        };
        // Real-time factor. Input PCM is 16 kHz mono, so audio length in seconds
        // is samples / 16000. `speedup` is audio_secs / elapsed_secs — e.g. 4.00x
        // means transcribed 4x faster than real time
        let elapsed_secs = (et - st).as_secs_f64();
        let audio_secs = audio_len as f64 / 16_000.0;
        let speedup = real_time_factor(audio_secs, elapsed_secs);
        info!(
            "Transcription completed in {:.2}s for {:.2}s of audio ({:.2}x real-time){}",
            elapsed_secs, audio_secs, speedup, translation_note
        );

        let final_result = filtered_result;

        if final_result.is_empty() {
            info!("Transcription result is empty");
        } else {
            info!(
                "Transcription result: {}",
                crate::utils::redact_text(&final_result)
            );
        }

        self.maybe_unload_immediately("transcription");

        Ok(final_result)
    }
}

struct StreamPerf {
    feed_count: u64,
    emit_count: u64,
    streamed_samples: u64,
    stream_compute_elapsed: Duration,
    last_log: Instant,
    latest_revision: i32,
    latest_input_received_ms: i64,
    latest_audio_committed_ms: i64,
    latest_buffered_ms: i64,
}

impl StreamPerf {
    fn new() -> Self {
        Self {
            feed_count: 0,
            emit_count: 0,
            streamed_samples: 0,
            stream_compute_elapsed: Duration::ZERO,
            last_log: Instant::now(),
            latest_revision: 0,
            latest_input_received_ms: 0,
            latest_audio_committed_ms: 0,
            latest_buffered_ms: 0,
        }
    }

    fn record_feed(&mut self, samples: usize) {
        self.feed_count += 1;
        self.streamed_samples += samples as u64;
    }

    fn record_compute(&mut self, elapsed: Duration) {
        self.stream_compute_elapsed += elapsed;
    }

    fn record_update(
        &mut self,
        revision: i32,
        input_received_ms: i64,
        audio_committed_ms: i64,
        buffered_ms: i64,
    ) {
        self.latest_revision = revision;
        self.latest_input_received_ms = input_received_ms;
        self.latest_audio_committed_ms = audio_committed_ms;
        self.latest_buffered_ms = buffered_ms;
    }

    fn record_emit(&mut self) {
        self.emit_count += 1;
    }

    fn maybe_log(&mut self) {
        if self.last_log.elapsed() < STREAM_PERF_LOG_INTERVAL {
            return;
        }

        let audio_secs = self.audio_secs();
        let compute_secs = self.compute_secs();
        debug!(
            "Live preview perf: {:.2}s streamed audio, {:.2}s model compute ({:.2}x real-time), \
             input_received={:.2}s, committed_audio={:.2}s, buffered={}ms, revision={}, \
             {} frames fed, {} updates emitted",
            audio_secs,
            compute_secs,
            real_time_factor(audio_secs, compute_secs),
            self.latest_input_received_ms as f64 / 1000.0,
            self.latest_audio_committed_ms as f64 / 1000.0,
            self.latest_buffered_ms,
            self.latest_revision,
            self.feed_count,
            self.emit_count,
        );
        self.last_log = Instant::now();
    }

    fn log_finalized(&self, chars: usize) {
        let audio_secs = self.audio_secs();
        let compute_secs = self.compute_secs();
        info!(
            "Live preview finalized in {:.2}s model compute for {:.2}s streamed audio ({:.2}x real-time): \
             input_received={:.2}s, committed_audio={:.2}s, buffered={}ms, revision={}, \
             {} frames fed, {} updates emitted, {} chars",
            compute_secs,
            audio_secs,
            real_time_factor(audio_secs, compute_secs),
            self.latest_input_received_ms as f64 / 1000.0,
            self.latest_audio_committed_ms as f64 / 1000.0,
            self.latest_buffered_ms,
            self.latest_revision,
            self.feed_count,
            self.emit_count,
            chars
        );
    }

    fn audio_secs(&self) -> f64 {
        self.streamed_samples as f64 / 16_000.0
    }

    fn compute_secs(&self) -> f64 {
        self.stream_compute_elapsed.as_secs_f64()
    }
}

fn real_time_factor(audio_secs: f64, compute_secs: f64) -> f64 {
    if compute_secs > 0.0 {
        audio_secs / compute_secs
    } else {
        0.0
    }
}

fn normalize_cjk_language(language: &str) -> &str {
    match language {
        "zh-Hans" | "zh-Hant" => "zh",
        other => other,
    }
}

/// Resolve the persisted language intent into the language a specific model can
/// use without writing the coerced value back to settings.
fn effective_language_for_model(
    settings: &AppSettings,
    model_manager: &ModelManager,
    model_id: &str,
) -> String {
    match model_manager.get_model_info(model_id) {
        Some(info) => crate::managers::model::effective_language(
            &settings.selected_language,
            &info.supported_languages,
            info.supports_language_detection,
        ),
        None => settings.selected_language.clone(),
    }
}

/// Resolve how confidently Handy knows the language of the text produced by a
/// transcription run. The UI language is deliberately not part of this
/// decision.
fn resolve_output_language_evidence(
    settings: &AppSettings,
    applied_language_hint: Option<&str>,
    supported_languages: &[String],
    translated_to_english: bool,
) -> OutputLanguageEvidence {
    if translated_to_english {
        return OutputLanguageEvidence::TranslatedToEnglish;
    }

    // Stored language intent is only evidence when this specific engine run
    // actually received the hint. Some multilingual engines (notably Parakeet
    // V3) always auto-detect and ignore Handy's selection; transcribe-cpp also
    // drops a requested hint when the loaded model does not advertise it.
    if let Some(language) = applied_language_hint.filter(|lang| !lang.is_empty() && *lang != "auto")
    {
        if settings.selected_language != "auto"
            && crate::managers::model::canonical_language_code(&settings.selected_language)
                == crate::managers::model::canonical_language_code(language)
        {
            return OutputLanguageEvidence::UserSelected(language.to_string());
        }

        // The engine may have required a concrete fallback even though the
        // user's persisted language was auto or unsupported.
        return OutputLanguageEvidence::ModelConstrained(language.to_string());
    }

    // A single-language model has a known output language without needing a
    // selectable language hint.
    if let [language] = supported_languages {
        return OutputLanguageEvidence::ModelConstrained(language.clone());
    }

    OutputLanguageEvidence::Unknown
}

/// Upgrade [`OutputLanguageEvidence::Unknown`] with the language the model
/// itself detected during the run (audio-based LID, e.g. Whisper in auto
/// mode). Stronger evidence resolved before the run is never overridden.
fn with_model_detected_language(
    evidence: OutputLanguageEvidence,
    detected: Option<String>,
) -> OutputLanguageEvidence {
    match (evidence, detected) {
        (OutputLanguageEvidence::Unknown, Some(language))
            if !language.is_empty() && language != "auto" =>
        {
            OutputLanguageEvidence::ModelDetected(language)
        }
        (evidence, _) => evidence,
    }
}

struct TranscribeCppRunPlan {
    task: Task,
    language: Option<String>,
    target_language: Option<String>,
}

/// Build the transcribe-cpp language/task options shared by batch and live
/// streaming paths.
fn transcribe_cpp_run_plan(
    translate_to_english: bool,
    effective_language: &str,
    model_languages: &[String],
    model_supports_translate: bool,
) -> TranscribeCppRunPlan {
    let requested_language = match effective_language {
        "auto" => None,
        other => Some(normalize_cjk_language(other).to_string()),
    };
    // Only pass a language the loaded model actually advertises (per
    // capabilities().languages); otherwise auto-detect rather than failing with
    // UNSUPPORTED_LANGUAGE. Language-agnostic models report an empty list, so
    // they always stay on auto.
    let language = requested_language.filter(|lang| model_languages.iter().any(|l| l == lang));
    let (task, target_language) = cpp_translation_task(
        translate_to_english,
        model_supports_translate,
        language.as_deref(),
    );

    TranscribeCppRunPlan {
        task,
        language,
        target_language,
    }
}

fn post_process_transcription_text(
    raw: String,
    settings: &AppSettings,
    custom_words_already_prompted: bool,
    output_language: &OutputLanguageEvidence,
    supported_languages: &[String],
) -> String {
    fail_open_text_transform(raw, |raw| {
        let corrected = if !settings.custom_words.is_empty() && !custom_words_already_prompted {
            apply_custom_words(
                &raw,
                &settings.custom_words,
                settings.word_correction_threshold,
            )
        } else {
            raw
        };

        // Last-resort language evidence: confidence-gated detection from the
        // transcribed text itself, constrained to the model's languages. Only
        // consulted when it can change the outcome (built-in gated fillers).
        let output_language = match output_language {
            OutputLanguageEvidence::Unknown
                if settings.filler_word_removal_enabled
                    && settings.custom_filler_words.is_none() =>
            {
                match detect_output_language(&corrected, supported_languages) {
                    Some(language) => {
                        debug!("Text-based language detection resolved '{}'", language);
                        OutputLanguageEvidence::TextDetected(language)
                    }
                    None => OutputLanguageEvidence::Unknown,
                }
            }
            other => other.clone(),
        };

        let without_fillers = remove_filler_words(
            &corrected,
            &output_language,
            &settings.custom_filler_words,
            settings.filler_word_removal_enabled,
        );

        normalize_transcription_output(&without_fillers)
    })
}

/// Optional text cleanup must never discard a successful model result. The
/// transform is pure and owns its input, so recovering the untouched text is
/// safe even if a bug in custom-word or filler filtering unwinds.
fn fail_open_text_transform<F>(raw: String, transform: F) -> String
where
    F: FnOnce(String) -> String,
{
    let fallback = raw.clone();
    match catch_unwind(AssertUnwindSafe(|| transform(raw))) {
        Ok(processed) => processed,
        Err(payload) => {
            error!(
                "Optional transcription text post-processing panicked: {}; using the raw transcription",
                panic_payload_message(payload.as_ref())
            );
            fallback
        }
    }
}

/// Decide a transcribe-cpp run's task + translation target from settings.
///
/// "Translate to English" only fires where the model advertises translation.
/// Unlike transcribe-rs (which forces the target to English itself when its
/// `translate` flag is set), transcribe-cpp requires an explicit
/// `target_language`: a null target defaults to the *source*, so a non-English
/// source silently becomes e.g. es→es and Canary rejects the unadvertised pair.
/// An English source is skipped entirely — en→en is not a real translation, and
/// it's reachable by default since auto-detect-less models coerce intent to "en".
///
/// Returns `(task, target_language)` ready to drop into `RunOptions`.
fn cpp_translation_task(
    translate_to_english: bool,
    model_supports_translate: bool,
    source_language: Option<&str>,
) -> (Task, Option<String>) {
    let translate_to_en =
        translate_to_english && model_supports_translate && source_language != Some("en");
    if translate_to_en {
        (Task::Translate, Some("en".to_string()))
    } else {
        (Task::Transcribe, None)
    }
}

/// Drain a stream command channel, ignoring fed audio, until the caller
/// finalizes or cancels. Used when streaming can't actually run (model not
/// loaded / not streaming-capable) so the finalize handshake still completes
/// and the caller falls back to batch transcription.
fn drain_until_finalize(rx: mpsc::Receiver<StreamCmd>) {
    while let Ok(cmd) = rx.recv() {
        match cmd {
            StreamCmd::Feed(_) => {}
            StreamCmd::Finalize(reply) => {
                let _ = reply.send(None);
                break;
            }
            StreamCmd::Cancel => break,
        }
    }
}

/// Initialize the transcribe-cpp native backend once at startup: route native +
/// ggml diagnostics into the `log` facade and register compute backend modules.
/// In a static build (macOS Metal) `init_backends_default` is a harmless no-op;
/// in a `dynamic-backends` build it loads the per-ISA CPU / GPU modules. Must run
/// before the first model load.
pub fn init_transcribe_backend() {
    if let Err(error) = crate::runtime::initialize() {
        warn!("Dictation runtime: {error:#}");
    }
}
pub fn describe_compute_devices() -> Vec<String> {
    crate::runtime::devices()
        .unwrap_or_default()
        .into_iter()
        .map(|d| {
            format!(
                "index={:?} kind={} name={} vram={}MB",
                d.index,
                d.kind,
                d.name,
                d.memory_total / (1024 * 1024)
            )
        })
        .collect()
}
pub fn apply_accelerator_settings(_app: &tauri::AppHandle) {}
#[derive(Serialize, Clone, Debug, Type)]
pub struct GpuDeviceOption {
    pub id: String,
    pub name: String,
    pub total_vram_mb: usize,
}
#[derive(Serialize, Clone, Debug, Type)]
pub struct AvailableAccelerators {
    pub transcribe: Vec<String>,
    pub ort: Vec<String>,
    pub gpu_devices: Vec<GpuDeviceOption>,
}
fn transcribe_gpu_disabled_for_host() -> bool {
    crate::utils::is_windows_x64_emulated_on_arm64()
}
fn effective_transcribe_accelerator(
    setting: TranscribeAcceleratorSetting,
    gpu_disabled: bool,
) -> TranscribeAcceleratorSetting {
    if gpu_disabled {
        TranscribeAcceleratorSetting::Cpu
    } else {
        setting
    }
}
#[cfg(test)]
#[derive(Debug, PartialEq)]
enum Backend {
    Auto,
    Cpu,
}
#[cfg(test)]
fn select_transcribe_backend_for_host(
    setting: TranscribeAcceleratorSetting,
    gpu_disabled: bool,
) -> Backend {
    match effective_transcribe_accelerator(setting, gpu_disabled) {
        TranscribeAcceleratorSetting::Cpu => Backend::Cpu,
        _ => Backend::Auto,
    }
}
fn transcribe_device_allowed(kind: &str, gpu_disabled: bool) -> bool {
    !gpu_disabled || matches!(kind, "cpu" | "accel")
}
fn available_transcribe_accelerators(gpu_disabled: bool) -> Vec<String> {
    if gpu_disabled {
        vec!["cpu".into()]
    } else {
        vec!["auto".into(), "cpu".into(), "gpu".into()]
    }
}
pub fn get_available_accelerators() -> AvailableAccelerators {
    let gpu_disabled = transcribe_gpu_disabled_for_host();
    let gpu_devices = crate::runtime::devices()
        .unwrap_or_default()
        .into_iter()
        .filter(|d| !gpu_disabled && d.is_gpu)
        .map(|d| GpuDeviceOption {
            id: d.id,
            name: d.name,
            total_vram_mb: (d.memory_total / (1024 * 1024)) as usize,
        })
        .collect();
    AvailableAccelerators {
        transcribe: available_transcribe_accelerators(gpu_disabled),
        ort: vec!["auto".into(), "cpu".into()],
        gpu_devices,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn languages(codes: &[&str]) -> Vec<String> {
        codes.iter().map(|code| (*code).to_string()).collect()
    }

    #[test]
    fn normal_hosts_preserve_every_transcribe_accelerator_setting() {
        for setting in [
            TranscribeAcceleratorSetting::Auto,
            TranscribeAcceleratorSetting::Cpu,
            TranscribeAcceleratorSetting::Gpu,
        ] {
            assert_eq!(effective_transcribe_accelerator(setting, false), setting);
        }
        assert_eq!(
            available_transcribe_accelerators(false),
            ["auto", "cpu", "gpu"]
        );
        assert_eq!(
            select_transcribe_backend_for_host(TranscribeAcceleratorSetting::Auto, false),
            Backend::Auto
        );
        assert_eq!(
            select_transcribe_backend_for_host(TranscribeAcceleratorSetting::Cpu, false),
            Backend::Cpu
        );
        assert_eq!(
            select_transcribe_backend_for_host(TranscribeAcceleratorSetting::Gpu, false),
            Backend::Auto
        );
        for kind in ["cpu", "accel", "metal", "cuda", "vulkan", "gpu"] {
            assert!(transcribe_device_allowed(kind, false));
        }
    }

    #[test]
    fn emulated_x64_on_arm64_forces_every_transcribe_setting_to_cpu() {
        for setting in [
            TranscribeAcceleratorSetting::Auto,
            TranscribeAcceleratorSetting::Cpu,
            TranscribeAcceleratorSetting::Gpu,
        ] {
            assert_eq!(
                effective_transcribe_accelerator(setting, true),
                TranscribeAcceleratorSetting::Cpu
            );
            assert_eq!(
                select_transcribe_backend_for_host(setting, true),
                Backend::Cpu
            );
        }
        assert_eq!(available_transcribe_accelerators(true), ["cpu"]);
        assert!(transcribe_device_allowed("cpu", true));
        assert!(transcribe_device_allowed("accel", true));
        for kind in ["metal", "cuda", "vulkan", "gpu", "unknown"] {
            assert!(!transcribe_device_allowed(kind, true));
        }
    }

    #[test]
    fn optional_text_transform_falls_back_to_raw_text_after_panic() {
        let raw = "原始轉錄。".to_string();
        let result = fail_open_text_transform(raw.clone(), |_| {
            panic!("simulated optional cleanup failure")
        });

        assert_eq!(result, raw);
    }

    #[test]
    fn portuguese_transcription_does_not_use_english_ui_filler_words() {
        let settings = AppSettings {
            app_language: "en".to_string(),
            selected_language: "pt-BR".to_string(),
            ..Default::default()
        };
        let supported = languages(&["en", "pt"]);
        let evidence = resolve_output_language_evidence(&settings, Some("pt"), &supported, false);

        let result = post_process_transcription_text(
            "eu vi um carro".to_string(),
            &settings,
            false,
            &evidence,
            &supported,
        );

        assert_eq!(
            evidence,
            OutputLanguageEvidence::UserSelected("pt".to_string())
        );
        assert_eq!(result, "eu vi um carro");
    }

    #[test]
    fn norwegian_alias_is_recorded_as_user_selected_evidence() {
        let settings = AppSettings {
            selected_language: "no".to_string(),
            ..Default::default()
        };

        let evidence =
            resolve_output_language_evidence(&settings, Some("nb"), &languages(&["nb"]), false);

        assert_eq!(
            evidence,
            OutputLanguageEvidence::UserSelected("nb".to_string())
        );
    }

    #[test]
    fn auto_language_without_detection_skips_gated_filler_removal() {
        let settings = AppSettings {
            selected_language: "auto".to_string(),
            ..Default::default()
        };
        let evidence =
            resolve_output_language_evidence(&settings, None, &languages(&["en", "pt"]), false);

        // Too short for a reliable text detection, so the gated "um" must
        // survive; the universal "uhm" is removed regardless.
        let result = post_process_transcription_text(
            "um uhm ok".to_string(),
            &settings,
            false,
            &evidence,
            &languages(&["en", "pt"]),
        );

        assert_eq!(evidence, OutputLanguageEvidence::Unknown);
        assert_eq!(result, "um ok");
    }

    #[test]
    fn unknown_evidence_with_confident_text_detection_removes_gated_fillers() {
        let settings = AppSettings {
            selected_language: "auto".to_string(),
            ..Default::default()
        };

        let result = post_process_transcription_text(
            "um so the weather forecast said it would probably rain throughout the whole weekend"
                .to_string(),
            &settings,
            false,
            &OutputLanguageEvidence::Unknown,
            &languages(&["en", "pt", "es", "de"]),
        );

        assert_eq!(
            result,
            "so the weather forecast said it would probably rain throughout the whole weekend"
        );
    }

    #[test]
    fn unknown_evidence_with_portuguese_text_preserves_um() {
        let settings = AppSettings {
            selected_language: "auto".to_string(),
            ..Default::default()
        };

        let result = post_process_transcription_text(
            "eu vi um carro na rua ontem de manhã quando fui ao mercado".to_string(),
            &settings,
            false,
            &OutputLanguageEvidence::Unknown,
            &languages(&["en", "pt", "es", "de"]),
        );

        assert_eq!(
            result,
            "eu vi um carro na rua ontem de manhã quando fui ao mercado"
        );
    }

    #[test]
    fn model_detected_language_upgrades_unknown_evidence_only() {
        assert_eq!(
            with_model_detected_language(OutputLanguageEvidence::Unknown, Some("en".to_string())),
            OutputLanguageEvidence::ModelDetected("en".to_string())
        );
        assert_eq!(
            with_model_detected_language(OutputLanguageEvidence::Unknown, Some("auto".to_string())),
            OutputLanguageEvidence::Unknown
        );
        assert_eq!(
            with_model_detected_language(OutputLanguageEvidence::Unknown, None),
            OutputLanguageEvidence::Unknown
        );
        assert_eq!(
            with_model_detected_language(
                OutputLanguageEvidence::UserSelected("pt".to_string()),
                Some("en".to_string())
            ),
            OutputLanguageEvidence::UserSelected("pt".to_string())
        );
    }

    #[test]
    fn auto_language_uses_single_language_model_as_evidence() {
        let settings = AppSettings {
            selected_language: "auto".to_string(),
            ..Default::default()
        };

        let evidence =
            resolve_output_language_evidence(&settings, None, &languages(&["en"]), false);

        assert_eq!(
            evidence,
            OutputLanguageEvidence::ModelConstrained("en".to_string())
        );
    }

    #[test]
    fn unsupported_explicit_language_uses_model_fallback_as_evidence() {
        let settings = AppSettings {
            selected_language: "pt".to_string(),
            ..Default::default()
        };

        let evidence = resolve_output_language_evidence(
            &settings,
            Some("en"),
            &languages(&["en", "de"]),
            false,
        );

        assert_eq!(
            evidence,
            OutputLanguageEvidence::ModelConstrained("en".to_string())
        );
    }

    #[test]
    fn ignored_user_language_is_not_output_evidence() {
        let settings = AppSettings {
            // Parakeet V3 ignores language hints and auto-detects even when a
            // selection from the previously active model remains persisted.
            selected_language: "en".to_string(),
            ..Default::default()
        };
        let supported = languages(&["en", "de", "pt"]);

        let evidence = resolve_output_language_evidence(&settings, None, &supported, false);
        assert_eq!(evidence, OutputLanguageEvidence::Unknown);

        let result = post_process_transcription_text(
            "eu vi um carro".to_string(),
            &settings,
            false,
            &evidence,
            &supported,
        );
        assert_eq!(result, "eu vi um carro");
    }

    #[test]
    fn unapplied_transcribe_cpp_language_is_not_output_evidence() {
        let settings = AppSettings {
            selected_language: "en".to_string(),
            ..Default::default()
        };
        let supported = languages(&[]);
        let plan = transcribe_cpp_run_plan(false, "en", &supported, false);

        assert_eq!(plan.language, None);
        assert_eq!(
            resolve_output_language_evidence(
                &settings,
                plan.language.as_deref(),
                &supported,
                false,
            ),
            OutputLanguageEvidence::Unknown
        );
    }

    #[test]
    fn translated_output_is_treated_as_english() {
        let settings = AppSettings {
            selected_language: "pt".to_string(),
            ..Default::default()
        };

        let evidence = resolve_output_language_evidence(
            &settings,
            Some("pt"),
            &languages(&["en", "pt"]),
            true,
        );

        assert_eq!(evidence, OutputLanguageEvidence::TranslatedToEnglish);
    }

    #[test]
    fn transcribe_cpp_run_plan_maps_chinese_variants() {
        let plan = transcribe_cpp_run_plan(false, "zh-Hant", &languages(&["zh"]), true);

        assert!(matches!(plan.task, Task::Transcribe));
        assert_eq!(plan.language.as_deref(), Some("zh"));
        assert_eq!(plan.target_language, None);
    }

    #[test]
    fn transcribe_cpp_run_plan_skips_english_translation() {
        let plan = transcribe_cpp_run_plan(true, "en", &languages(&["en", "es"]), true);

        assert!(matches!(plan.task, Task::Transcribe));
        assert_eq!(plan.language.as_deref(), Some("en"));
        assert_eq!(plan.target_language, None);
    }

    #[test]
    fn transcribe_cpp_run_plan_translates_supported_non_english() {
        let plan = transcribe_cpp_run_plan(true, "es", &languages(&["en", "es"]), true);

        assert!(matches!(plan.task, Task::Translate));
        assert_eq!(plan.language.as_deref(), Some("es"));
        assert_eq!(plan.target_language.as_deref(), Some("en"));
    }

    #[test]
    fn transcribe_cpp_run_plan_requires_model_translation_support() {
        let plan = transcribe_cpp_run_plan(true, "es", &languages(&["en", "es"]), false);

        assert!(matches!(plan.task, Task::Transcribe));
        assert_eq!(plan.language.as_deref(), Some("es"));
        assert_eq!(plan.target_language, None);
    }
}

impl Drop for TranscriptionManager {
    fn drop(&mut self) {
        // Skip shutdown unless this is the very last clone. TranscriptionManager
        // is cloned by initiate_model_load() and the watcher thread — those
        // clones dropping must not kill the watcher. The watcher thread holds
        // its own clone, so engine's strong_count is always >= 2 while the
        // watcher is alive. When it reaches 1, only this instance remains
        // and we can safely shut down.
        if Arc::strong_count(&self.engine) > 1 {
            return;
        }

        // Signal the watcher thread to shutdown
        self.shutdown_signal.store(true, Ordering::Relaxed);

        // Wait for the thread to finish gracefully.
        // Use match instead of unwrap to avoid panicking if the mutex is
        // poisoned — a panic inside Drop calls abort().
        let mut guard = match self.watcher_handle.lock() {
            Ok(g) => g,
            Err(e) => {
                warn!("Recovered poisoned watcher_handle mutex during TranscriptionManager drop — a panic occurred earlier this session");
                e.into_inner()
            }
        };
        if let Some(handle) = guard.take() {
            if let Err(e) = handle.join() {
                warn!("Failed to join idle watcher thread: {:?}", e);
            } else {
                debug!("Idle watcher thread joined successfully");
            }
        }
    }
}
