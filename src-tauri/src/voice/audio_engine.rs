use crossbeam_channel::{bounded, Receiver, Sender};
use crate::voice::denoise::{self, FRAME_SIZE};
use crate::voice::dsp::DspModule;
use crate::voice::eq::EqConfig;
use crate::voice::explode::ExplodeState;
use crate::voice::audio_init::init_monitor;
use crate::voice::explode::ExplodeAudioState;
use crate::voice::wasapi_capture::{self, Frame};
use crate::voice::wasapi_render;
use parking_lot::RwLock;
use ringbuf::traits::{Consumer, Producer, Split};
use ringbuf::HeapRb;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use tauri::AppHandle;
use crate::voice::debug::{debug_log, debug_log_dev, flush_debug_log};
use crate::voice::audio_utils::{calculate_rms, compute_spectrum_into, write_to_monitor};

/// Ring buffer 甯у閲忥細8 甯?鈮?80ms headroom锛堝弬鑰?noisegate锛?
const RING_FRAMES: usize = 8;

/// 鐩戝惉鐐瑰啓鍏ュ畯锛氭鏌ユ潯浠跺悗鍐欏叆鐩戝惉璁惧
macro_rules! monitor_write {
    ($monitor:expr, $target:expr, $current:expr, $enabled:expr, $samples:expr, $resample:expr) => {
        if $enabled && $current == $target && $monitor.was_streaming && $monitor.render.is_some() {
            write_to_monitor(
                $samples,
                &$monitor.render,
                &$monitor.event,
                &$monitor.client,
                &mut $monitor.buffer,
                $monitor.sample_rate,
                $resample,
                &mut $monitor.pending,
                $monitor.channels,
                $monitor.bits_per_sample,
                $monitor.is_float,
            );
        }
    };
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DenoiseConfig {
    pub enabled: bool,
    pub strength: f32,
    pub suppress_level: f32,
    pub mic_gain: f32,
    pub agc_enabled: bool,
    pub agc_target: f32,
}

impl Default for DenoiseConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            strength: 0.5,
            suppress_level: 0.5,
            mic_gain: 1.0,
            agc_enabled: false,
            agc_target: 0.03,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BgmConfig {
    pub process_names: Vec<String>,
    pub process_pids: Vec<u32>,
}

impl Default for BgmConfig {
    fn default() -> Self {
        Self { process_names: Vec::new(), process_pids: Vec::new() }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AudioStats {
    pub input_level: f32,
    pub output_level: f32,
    /// Peak of capture frame, dBFS (0 = full scale).
    pub input_peak: f32,
    /// Peak right after mic_gain / AGC, dBFS — moves with software gain.
    pub post_gain_peak: f32,
    /// True when recent frames hit near-full-scale peak (hardware overload).
    pub input_clipping: bool,
    pub noise_reduction_db: f32,
    pub latency_ms: f32,
    pub cpu_usage: f32,
    pub frames_processed: u64,
    pub spectrum: Vec<f32>,
    pub spectrum_out: Vec<f32>,
    pub frames_dropped: u64,
}

pub type MonitorPoint = u32;

pub struct AudioEngine {
    running: Arc<AtomicBool>,
    config: Arc<RwLock<DenoiseConfig>>,
    eq_config: Arc<RwLock<EqConfig>>,
    eq_config_dirty: Arc<AtomicBool>,
    stats: Arc<RwLock<AudioStats>>,
    bgm_running: Arc<AtomicBool>,
    bgm_gain: Arc<AtomicU32>,
    bgm_skip_rate: Arc<AtomicU32>,
    #[allow(dead_code)]
    bgm_config: Arc<RwLock<BgmConfig>>,
    bgm_sender: Sender<Vec<i16>>,
    bgm_receiver: Receiver<Vec<i16>>,
    bgm_thread_running: parking_lot::Mutex<Arc<AtomicBool>>,
    bgm_was_active: Arc<AtomicBool>,
    explode_enabled: Arc<AtomicBool>,
    explode_state: Arc<ExplodeState>,
    monitor_enabled: Arc<AtomicBool>,
    monitor_point: Arc<AtomicU32>,
    thread_handle: std::sync::Mutex<Option<std::thread::JoinHandle<()>>>,
    bgm_thread_handle: std::sync::Mutex<Option<std::thread::JoinHandle<()>>>,
    model_states: std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, Vec<u8>>>>,
    /// 妯″瀷鐑垏鎹?channel锛堝彂閫佺锛屼紶閫掑凡鍒涘缓濂界殑妯″瀷锛?
    model_switch_sender: Sender<(String, Box<dyn denoise::DenoiseModel>)>,
    /// 妯″瀷鐑垏鎹?channel锛堟帴鏀剁锛屼紶閫掔粰 DSP 绾跨▼锛?
    model_switch_receiver: Receiver<(String, Box<dyn denoise::DenoiseModel>)>,
    /// 璧勬簮鐩綍璺緞锛堢敤浜庡姞杞芥ā鍨嬶級
    resource_dir: std::sync::Mutex<Option<std::path::PathBuf>>,
    app_handle: std::sync::Mutex<Option<AppHandle>>,
    lifecycle_lock: std::sync::Mutex<()>,
}

impl AudioEngine {
    pub fn new(app_handle: Option<AppHandle>) -> Self {
        let (bgm_sender, bgm_receiver) = bounded::<Vec<i16>>(10);
        let (model_switch_sender, model_switch_receiver) = bounded::<(String, Box<dyn denoise::DenoiseModel>)>(1);
        Self {
            running: Arc::new(AtomicBool::new(false)),
            config: Arc::new(RwLock::new(DenoiseConfig::default())),
            eq_config: Arc::new(RwLock::new(EqConfig::default())),
            eq_config_dirty: Arc::new(AtomicBool::new(false)),
            stats: Arc::new(RwLock::new(AudioStats::default())),
            bgm_running: Arc::new(AtomicBool::new(false)),
            bgm_gain: Arc::new(AtomicU32::new(1.0f32.to_bits())),
            bgm_skip_rate: Arc::new(AtomicU32::new(0)),
            bgm_config: Arc::new(RwLock::new(BgmConfig::default())),
            bgm_sender,
            bgm_receiver,
            bgm_thread_running: parking_lot::Mutex::new(Arc::new(AtomicBool::new(false))),
            bgm_was_active: Arc::new(AtomicBool::new(false)),
            explode_enabled: Arc::new(AtomicBool::new(false)),
            explode_state: Arc::new(ExplodeState::new()),
            monitor_enabled: Arc::new(AtomicBool::new(false)),
            monitor_point: Arc::new(AtomicU32::new(0)),
            thread_handle: std::sync::Mutex::new(None),
            bgm_thread_handle: std::sync::Mutex::new(None),
            model_states: std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::new())),
            model_switch_sender,
            model_switch_receiver,
            resource_dir: std::sync::Mutex::new(None),
            app_handle: std::sync::Mutex::new(app_handle),
            lifecycle_lock: std::sync::Mutex::new(()),
        }
    }

    #[allow(dead_code)]
    pub fn config(&self) -> &Arc<RwLock<DenoiseConfig>> { &self.config }
    #[allow(dead_code)]
    pub fn eq_config(&self) -> &Arc<RwLock<EqConfig>> { &self.eq_config }
    #[allow(dead_code)]
    pub fn eq_config_dirty(&self) -> &Arc<AtomicBool> { &self.eq_config_dirty }
    pub fn stats(&self) -> &Arc<RwLock<AudioStats>> { &self.stats }
    #[allow(dead_code)]
    pub fn bgm_running(&self) -> &Arc<AtomicBool> { &self.bgm_running }
    #[allow(dead_code)]
    pub fn bgm_gain(&self) -> &Arc<AtomicU32> { &self.bgm_gain }
    #[allow(dead_code)]
    pub fn bgm_skip_rate(&self) -> &Arc<AtomicU32> { &self.bgm_skip_rate }
    #[allow(dead_code)]
    pub fn bgm_config(&self) -> &Arc<RwLock<BgmConfig>> { &self.bgm_config }
    #[allow(dead_code)]
    pub fn bgm_sender(&self) -> &Sender<Vec<i16>> { &self.bgm_sender }
    #[allow(dead_code)]
    pub fn bgm_was_active(&self) -> &Arc<AtomicBool> { &self.bgm_was_active }
    #[allow(dead_code)]
    pub fn explode_enabled(&self) -> &Arc<AtomicBool> { &self.explode_enabled }
    #[allow(dead_code)]
    pub fn explode_state(&self) -> &Arc<ExplodeState> { &self.explode_state }
    #[allow(dead_code)]
    pub fn monitor_enabled(&self) -> &Arc<AtomicBool> { &self.monitor_enabled }
    #[allow(dead_code)]
    pub fn monitor_point(&self) -> &Arc<AtomicU32> { &self.monitor_point }
    #[allow(dead_code)]
    #[allow(dead_code)]
    pub fn running(&self) -> &Arc<AtomicBool> { &self.running }
    #[allow(dead_code)]
    pub fn is_running(&self) -> bool { self.running.load(Ordering::Acquire) }

    pub fn start(
        &self,
        input_device_name: Option<String>,
        output_device_name: Option<String>,
        model_name: Option<String>,
        resource_dir: Option<std::path::PathBuf>,
    ) -> Result<(), String> {
        let _lock = self.lifecycle_lock.lock().unwrap_or_else(|e| e.into_inner());
        if self.running.load(Ordering::Acquire) {
            return Err("Engine is already running".to_string());
        }
        self.stop_inner();

        // 淇濆瓨 resource_dir 渚?switch_model 浣跨敤
        *self.resource_dir.lock().unwrap() = resource_dir.clone();

        let running = self.running.clone();
        let config = self.config.clone();
        let eq_config = self.eq_config.clone();
        let eq_config_dirty = self.eq_config_dirty.clone();
        let stats = self.stats.clone();
        let bgm_running = self.bgm_running.clone();
        let bgm_gain = self.bgm_gain.clone();
        let bgm_skip_rate = self.bgm_skip_rate.clone();
        let bgm_receiver = self.bgm_receiver.clone();
        let bgm_was_active = self.bgm_was_active.clone();
        let explode_enabled = self.explode_enabled.clone();
        let explode_state = self.explode_state.clone();
        let monitor_enabled = self.monitor_enabled.clone();
        let monitor_point = self.monitor_point.clone();
        let saved_model_states = self.model_states.clone();
        let model_switch_receiver = self.model_switch_receiver.clone();
        let app_handle = self.app_handle.lock().unwrap().clone();

        running.store(true, Ordering::Release);
        crate::voice::mmcss::boost_process_for_voice();

        let handle = std::thread::Builder::new()
            .name("audio-main".into())
            .spawn(move || {
                #[cfg(windows)]
                let _mmcss_main = crate::voice::mmcss::ProAudio::set_for_current_thread();
                if let Err(e) = audio_loop(
                    running, config, eq_config, eq_config_dirty, stats,
                    bgm_running, bgm_gain, bgm_skip_rate, bgm_receiver, bgm_was_active,
                    explode_enabled, explode_state, monitor_enabled, monitor_point,
                    input_device_name, output_device_name, model_name, resource_dir,
                    saved_model_states, model_switch_receiver, app_handle,
                ) {
                    log::error!("Audio loop error: {}", e);
                }
            })
            .map_err(|e| format!("Failed to spawn audio thread: {}", e))?;

        *self.thread_handle.lock().unwrap() = Some(handle);
        Ok(())
    }

    pub fn stop(&self) {
        let _lock = self.lifecycle_lock.lock().unwrap_or_else(|e| e.into_inner());
        self.stop_inner();
    }

    fn stop_inner(&self) {
        self.running.store(false, Ordering::Release);
        if let Some(handle) = self.thread_handle.lock().unwrap().take() {
            let _ = handle.join();
        }
        // 蹇呴』璁?bgm_thread_running锛圔GM 绾跨▼璇荤殑 flag锛夛紝涓嶆槸 bgm_running
        self.bgm_thread_running.lock().store(false, Ordering::Release);
        self.bgm_was_active.store(false, Ordering::Release);
        if let Some(handle) = self.bgm_thread_handle.lock().unwrap().take() {
            let _ = handle.join();
        }
        self.bgm_running.store(false, Ordering::Release);
        crate::voice::mmcss::restore_process_priority();
        flush_debug_log();
    }

    pub fn update_config(&self, new_config: DenoiseConfig) { *self.config.write() = new_config; }
    pub fn get_config(&self) -> DenoiseConfig { self.config.read().clone() }
    pub fn update_eq_config(&self, new_config: EqConfig) {
        *self.eq_config.write() = new_config;
        self.eq_config_dirty.store(true, Ordering::Release);
    }
    pub fn get_eq_config(&self) -> EqConfig { self.eq_config.read().clone() }

    /// 鐑垏鎹㈤檷鍣ā鍨嬶紙涓嶉噸鍚紩鎿庯級
    /// 鍦ㄥ悗鍙扮嚎绋嬪垱寤烘柊妯″瀷锛屽垱寤哄畬鎴愬悗鍙戦€佸埌 DSP 绾跨▼鏇挎崲
    pub fn switch_model(&self, model_name: String) -> Result<(), String> {
        if !self.running.load(Ordering::Acquire) {
            return Err("Engine is not running".to_string());
        }

        let sender = self.model_switch_sender.clone();
        let resource_dir = self.resource_dir.lock().unwrap().clone();

        // 鍚庡彴绾跨▼鍒涘缓妯″瀷锛岄伩鍏嶉樆濉?DSP 绾跨▼
        std::thread::Builder::new()
            .name("model-loader".into())
            .spawn(move || {
                let new_model = denoise::create_model(&model_name, resource_dir.as_deref());
                // 闈為樆濉炲彂閫侊紝channel 婊¤鏄庡凡鏈夊垏鎹㈣姹傦紝涓㈠純鏈
                let _ = sender.try_send((model_name, new_model));
            })
            .map_err(|e| format!("Failed to spawn model loader: {}", e))?;

        Ok(())
    }

    /// Upstream Better Voice BGM capture — not exposed in Music Island embed.
    #[allow(dead_code)]
    pub fn start_bgm(&self, pid: u32) -> Result<(), String> {
        self.stop_bgm();
        let running = Arc::new(AtomicBool::new(true));
        *self.bgm_thread_running.lock() = running.clone();
        let sender = self.bgm_sender.clone();
        let skip_rate = self.bgm_skip_rate.clone();
        let bgm_running = self.bgm_running.clone();
        let handle = std::thread::Builder::new()
            .name(format!("bgm-{}", pid))
            .spawn(move || {
                bgm_running.store(true, Ordering::Release);
                let _ = crate::voice::bgm::bgm_process_loop(running, sender, pid, skip_rate);
                bgm_running.store(false, Ordering::Release);
            })
            .map_err(|e| format!("Failed to spawn BGM thread: {}", e))?;
        *self.bgm_thread_handle.lock().unwrap() = Some(handle);
        self.bgm_was_active.store(true, Ordering::Release);
        Ok(())
    }

    #[allow(dead_code)]
    pub fn stop_bgm(&self) {
        // 閫氱煡 BGM 绾跨▼閫€鍑猴紙bgm_thread_running 鏄嚎绋嬭鐨?flag锛?
        self.bgm_thread_running.lock().store(false, Ordering::Release);
        if let Some(handle) = self.bgm_thread_handle.lock().unwrap().take() {
            let _ = handle.join();
        }
        // 绾跨▼閫€鍑哄悗 bgm_running 鑷姩鍙樹负 false锛堢嚎绋嬫湯灏捐缃級
        self.bgm_running.store(false, Ordering::Release);
    }

    #[allow(dead_code)]
    pub fn cancel_bgm_auto_restart(&self) { self.bgm_was_active.store(false, Ordering::Release); }

    pub fn set_explode_mode(&self, enabled: bool) {
        self.explode_enabled.store(enabled, Ordering::Release);
        self.explode_state.enabled.store(enabled, Ordering::Release);
    }

    pub fn set_explode_intensity(&self, intensity: u32) {
        self.explode_state.intensity.store(intensity, Ordering::Release);
    }

    pub fn set_explode_effect(&self, effect: crate::voice::explode::ExplodeEffect) {
        self.explode_state.effect_type.store(effect as u32, Ordering::Release);
    }

    #[allow(dead_code)]
    pub fn update_bgm_config(&self, bgm_gain: f32) {
        if bgm_gain.is_finite() {
            self.bgm_gain.store(bgm_gain.to_bits(), Ordering::Release);
        }
    }

    pub fn set_monitor_enabled(&self, enabled: bool) { self.monitor_enabled.store(enabled, Ordering::Release); }
    pub fn set_monitor_point(&self, point: MonitorPoint) { self.monitor_point.store(point, Ordering::Release); }

    #[allow(dead_code)]
    pub fn save_model_state(&self, name: &str, state: Vec<u8>) {
        if let Ok(mut states) = self.model_states.lock() { states.insert(name.to_string(), state); }
    }
    #[allow(dead_code)]
    pub fn get_saved_model_states(&self) -> std::collections::HashMap<String, Vec<u8>> {
        self.model_states.lock().unwrap().clone()
    }

    #[allow(dead_code)]
    pub fn list_audio_processes(&self) -> Result<Vec<(String, String, u32)>, String> {
        crate::voice::bgm::list_audio_processes()
    }

    #[allow(dead_code)]
    pub fn set_app_handle(&self, handle: AppHandle) {
        *self.app_handle.lock().unwrap() = Some(handle);
    }
}

impl Drop for AudioEngine {
    fn drop(&mut self) { self.stop(); }
}

/// 涓夌嚎绋嬮煶棰戝惊鐜叆鍙?
///
/// 鏋舵瀯锛歝apture_thread 鈫?ring A 鈫?dsp_thread 鈫?ring B 鈫?render_thread
#[allow(clippy::too_many_arguments)]
fn audio_loop(
    running: Arc<AtomicBool>,
    config: Arc<RwLock<DenoiseConfig>>,
    eq_config: Arc<RwLock<EqConfig>>,
    eq_config_dirty: Arc<AtomicBool>,
    stats: Arc<RwLock<AudioStats>>,
    bgm_running: Arc<AtomicBool>,
    bgm_gain: Arc<AtomicU32>,
    _bgm_skip_rate: Arc<AtomicU32>,
    bgm_receiver: Receiver<Vec<i16>>,
    _bgm_was_active: Arc<AtomicBool>,
    explode_enabled: Arc<AtomicBool>,
    explode_state: Arc<ExplodeState>,
    monitor_enabled: Arc<AtomicBool>,
    monitor_point: Arc<AtomicU32>,
    input_device_name: Option<String>,
    output_device_name: Option<String>,
    model_name: Option<String>,
    resource_dir: Option<std::path::PathBuf>,
    saved_model_states: std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, Vec<u8>>>>,
    model_switch_receiver: Receiver<(String, Box<dyn denoise::DenoiseModel>)>,
    app_handle: Option<AppHandle>,
) -> Result<(), String> {
    debug_log("audio_loop: starting (three-thread architecture)");

    let input_id = input_device_name.unwrap_or_default();
    let output_id = output_device_name.unwrap_or_default();

    // 鈹€鈹€ 鍦ㄤ富绾跨▼棰勫姞杞芥ā鍨嬶紙鍙傝€?noisegate-ref锛夆攢鈹€
    let mut denoise = denoise::create_model(model_name.as_deref().unwrap_or("RNNoise"), resource_dir.as_deref());
    let current_model_name = denoise.name().to_string();
    if let Ok(states_lock) = saved_model_states.lock() {
        if let Some(state) = states_lock.get(&current_model_name) {
            log::info!("Restoring model '{}' state ({} bytes)", current_model_name, state.len());
            denoise.load_state(state);
        }
    }
    log::info!("Using denoise model: {}", current_model_name);

    // 鈹€鈹€ 鍒涘缓 ring buffers 鈹€鈹€
    let (prod_a, cons_a) = HeapRb::<Frame>::new(RING_FRAMES).split();
    let (prod_b, cons_b) = HeapRb::<Frame>::new(RING_FRAMES).split();

    // 鈹€鈹€ 鍚姩椤哄簭锛欴SP 鈫?capture 鈫?render 鈹€鈹€

    // 鈹€鈹€ 1. 鍚姩 DSP 绾跨▼锛堟ā鍨嬪凡棰勫姞杞斤級鈹€鈹€
    let running_dsp = running.clone();
    let config_dsp = config.clone();
    let eq_config_dsp = eq_config.clone();
    let eq_config_dirty_dsp = eq_config_dirty.clone();
    let stats_dsp = stats.clone();
    let bgm_running_dsp = bgm_running.clone();
    let bgm_gain_dsp = bgm_gain.clone();
    let bgm_receiver_dsp = bgm_receiver;
    let explode_enabled_dsp = explode_enabled.clone();
    let explode_state_dsp = explode_state.clone();
    let monitor_enabled_dsp = monitor_enabled.clone();
    let monitor_point_dsp = monitor_point.clone();
    let saved_dsp = saved_model_states.clone();
    let model_switch_receiver_dsp = model_switch_receiver;
    let app_dsp = app_handle.clone();
    let model_name_dsp = current_model_name.clone();

    let dsp_handle = std::thread::Builder::new()
        .name("audio-dsp".into())
        .spawn(move || {
            #[cfg(windows)]
            let _mmcss = crate::voice::mmcss::ProAudio::set_for_current_thread();
            dsp_thread(
                running_dsp, cons_a, prod_b,
                config_dsp, eq_config_dsp, eq_config_dirty_dsp, stats_dsp,
                bgm_running_dsp, bgm_gain_dsp, bgm_receiver_dsp,
                explode_enabled_dsp, explode_state_dsp,
                monitor_enabled_dsp, monitor_point_dsp,
                denoise, &model_name_dsp,
                &saved_dsp, model_switch_receiver_dsp, &app_dsp,
            );
        })
        .map_err(|e| format!("Failed to spawn DSP thread: {}", e))?;

    // 鈹€鈹€ 2. 鍚姩 capture 绾跨▼ 鈹€鈹€
    struct CaptureSink {
        prod: ringbuf::CachingProd<Arc<HeapRb<Frame>>>,
    }
    impl wasapi_capture::FrameSink for CaptureSink {
        fn on_frame(&mut self, frame: &Frame) {
            if self.prod.try_push(*frame).is_err() {
                debug_log_dev("capture: ring A full, dropping frame");
            }
        }
    }
    let capture = wasapi_capture::WasapiCapture::start(
        &input_id, Box::new(CaptureSink { prod: prod_a }),
    ).map_err(|e| format!("Failed to start capture: {}", e))?;

    // 鈹€鈹€ 3. 鍚姩 render 绾跨▼ 鈹€鈹€
    struct RenderSource {
        cons: ringbuf::CachingCons<Arc<HeapRb<Frame>>>,
    }
    impl wasapi_render::FrameSource for RenderSource {
        fn next_frame(&mut self) -> Option<Frame> { self.cons.try_pop() }
    }
    let render = wasapi_render::WasapiRender::start(
        &output_id, Box::new(RenderSource { cons: cons_b }),
    ).map_err(|e| format!("Failed to start render: {}", e))?;

    // 鈹€鈹€ 涓荤嚎绋嬬瓑寰呴€€鍑?鈹€鈹€
    let _ = dsp_handle.join();

    // drop capture 鍜?render锛堣Е鍙戝悇鑷殑绾跨▼閫€鍑猴級
    drop(capture);
    drop(render);

    // 淇濆瓨妯″瀷鐘舵€侊紙鍦?drop capture 涔嬪悗锛岀‘淇濇ā鍨嬪凡鐢ㄥ畬锛?
    flush_debug_log();
    Ok(())
}

/// DSP 绾跨▼锛氫粠 ring A 鎷夊彇 f32 mono 甯?鈫?澶勭悊 鈫?鎺ㄥ叆 ring B
fn dsp_thread(
    running: Arc<AtomicBool>,
    mut cons_a: ringbuf::CachingCons<Arc<HeapRb<Frame>>>,
    mut prod_b: ringbuf::CachingProd<Arc<HeapRb<Frame>>>,
    config: Arc<RwLock<DenoiseConfig>>,
    eq_config: Arc<RwLock<EqConfig>>,
    eq_config_dirty: Arc<AtomicBool>,
    stats: Arc<RwLock<AudioStats>>,
    bgm_running: Arc<AtomicBool>,
    bgm_gain: Arc<AtomicU32>,
    bgm_receiver: Receiver<Vec<i16>>,
    explode_enabled: Arc<AtomicBool>,
    explode_state: Arc<ExplodeState>,
    monitor_enabled: Arc<AtomicBool>,
    monitor_point: Arc<AtomicU32>,
    mut denoise: Box<dyn denoise::DenoiseModel>,
    current_model_name: &str,
    saved_model_states: &std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, Vec<u8>>>>,
    model_switch_receiver: Receiver<(String, Box<dyn denoise::DenoiseModel>)>,
    _app_handle: &Option<AppHandle>,
) {
    debug_log_dev("dsp_thread: started");

    let mut current_model_name = current_model_name.to_string();
    debug_log(&format!("DSP thread: model={}", current_model_name));

    // EQ 鍒濆鍖?
    let mut eq_processor = crate::voice::eq::EqProcessor::new(48000);
    let mut last_eq_config: Option<EqConfig> = None;
    let current_eq_config = eq_config.read().clone();
    eq_config_dirty.store(false, Ordering::Release);
    if current_eq_config.enabled {
        eq_processor.apply_config(&current_eq_config);
        last_eq_config = Some(current_eq_config.clone());
    }

    // 鐩戝惉璁惧锛氬欢杩熷垵濮嬪寲
    let mut monitor = crate::voice::audio_init::MonitorState {
        client: None,
        render: None,
        event: None,
        sample_rate: 0,
        channels: 2,
        bits_per_sample: 32,
        is_float: true,
        buffer: Vec::new(),
        pending: Vec::new(),
        current_device_id: String::new(),
        was_streaming: false,
    };
    let mut mon_was_enabled = false;
    let mut resample_buf: Vec<f32> = vec![0.0; FRAME_SIZE * 4];

    // 鐖嗙偢妯″紡闊抽鐘舵€?
    let mut explode_audio = ExplodeAudioState::new();

    let mut last_strength: f32 = -1.0;
    let mut frame_count: u64 = 0;
    let mut frames_dropped: u64 = 0;
    // Hold clip flag ~400ms after last near-full-scale peak (10ms/frame ×40).
    let mut clip_hangover: u32 = 0;
    let mut last_input_peak_db: f32;
    let mut last_post_gain_peak_db: f32;

    // 频谱累积：每 4 帧（40ms）计算一次，提高频率分辨率到 ~25Hz/bin
    const SPECTRUM_ACC_FRAMES: usize = 4;
    const CLIP_THRESHOLD: f32 = 0.99;
    const CLIP_HANGOVER_FRAMES: u32 = 40;
    let mut spectrum_acc_in: Vec<f32> = vec![0.0; FRAME_SIZE * SPECTRUM_ACC_FRAMES];
    let mut spectrum_acc_out: Vec<f32> = vec![0.0; FRAME_SIZE * SPECTRUM_ACC_FRAMES];
    let mut spectrum_acc_idx: usize = 0;

    let mut bgm_buf: Vec<f32> = Vec::new();
    let mut bgm_read_pos: usize = 0;
    let mut stats_start = std::time::Instant::now();

    // DSP 妯″潡
    let mut hpf = crate::voice::dsp::hpf::HighPassFilter::default_48k();
    let mut limiter = crate::voice::dsp::limiter::SoftLimiter::default_limiter();
    let mut noise_gate = crate::voice::dsp::noise_gate::NoiseGate::new(0.01);

    // 鎵撳嵃鍒濆閰嶇疆
    let init_config = config.read().clone();
    debug_log(&format!("DSP_INIT: model={} enabled={} strength={} suppress={} mic_gain={} agc={} agc_target={} eq={} explode={} bgm={}",
        current_model_name, init_config.enabled, init_config.strength, init_config.suppress_level, init_config.mic_gain,
        init_config.agc_enabled, init_config.agc_target,
        eq_config.read().enabled, explode_enabled.load(Ordering::Relaxed), bgm_running.load(Ordering::Relaxed)));

    // AGC 鐘舵€?
    let mut agc = crate::voice::agc::AgcState::new();
    let mut last_agc_enabled = init_config.agc_enabled;

    while running.load(Ordering::Acquire) {
        // 妫€鏌ユā鍨嬬儹鍒囨崲璇锋眰锛堥潪闃诲锛屾ā鍨嬪凡鍦ㄥ悗鍙扮嚎绋嬪垱寤哄ソ锛?
        if let Ok((new_model_name, mut new_model)) = model_switch_receiver.try_recv() {
            debug_log(&format!("MODEL_SWITCH: {} -> {}", current_model_name, new_model_name));
            // 淇濆瓨鏃фā鍨嬬姸鎬?
            if let Some(state) = denoise.save_state() {
                if let Ok(mut states) = saved_model_states.lock() {
                    states.insert(current_model_name.clone(), state);
                }
            }
            // 灏濊瘯鍔犺浇鏃фā鍨嬬姸鎬侊紙浠呭悓绫诲瀷妯″瀷鍏煎锛?
            if let Ok(states) = saved_model_states.lock() {
                if let Some(state) = states.get(&new_model_name) {
                    new_model.load_state(state);
                    debug_log(&format!("MODEL_SWITCH: restored state for {}", new_model_name));
                }
            }
            // 搴旂敤褰撳墠 strength 璁剧疆
            let current_config = config.read().clone();
            new_model.update_strength(current_config.strength);
            denoise = new_model;
            current_model_name = new_model_name.clone();
            debug_log(&format!("MODEL_SWITCH: now using {}", current_model_name));
        }

        // 浠?ring A 鎷夊彇甯?
        let mut frame = match cons_a.try_pop() {
            Some(f) => f,
            None => {
                std::thread::sleep(std::time::Duration::from_millis(1));
                continue;
            }
        };

        frame_count += 1;
        let current_config = config.read().clone();

        // DeepFilterNet strength 鏇存柊
        if (current_config.strength - last_strength).abs() > f32::EPSILON {
            denoise.update_strength(current_config.strength);
            last_strength = current_config.strength;
        }

        // EQ 閰嶇疆鏇存柊
        if eq_config_dirty.load(Ordering::Acquire) {
            let new_eq = eq_config.read().clone();
            eq_processor.apply_config(&new_eq);
            last_eq_config = Some(new_eq);
            eq_config_dirty.store(false, Ordering::Release);
        }

        // 淇濆瓨鍘熷杈撳叆鐢ㄤ簬棰戣氨/鐢靛钩缁熻锛坣ormalized f32 [-1.0, 1.0]锛?
        let input_frame = frame;

        // 鈹€鈹€ 鐩戝惉鐐?1锛氬師濮嬭緭鍏?鈹€鈹€
        let mon_enabled = monitor_enabled.load(Ordering::Acquire);
        let mon_point = monitor_point.load(Ordering::Relaxed);
        monitor_write!(monitor, 1, mon_point, mon_enabled, &input_frame, &mut resample_buf);

        // 鈹€鈹€ 1. 闄嶅櫔 鈹€鈹€
        if current_config.enabled {
            denoise.process_frame(&mut frame, &input_frame);

            // NaN 妫€鏌?
            for sample in frame.iter_mut() {
                if !sample.is_finite() { *sample = 0.0; }
            }

            // 姣?500 甯ф墦鍗颁竴娆″畬鏁寸姸鎬侊紙浠呭紑鍙戠幆澧冿級
            if frame_count % 500 == 1 {
                let in_peak = input_frame.iter().fold(0.0f32, |a, &x| a.max(x.abs()));
                let out_peak = frame.iter().fold(0.0f32, |a, &x| a.max(x.abs()));
                debug_log_dev(&format!(
                    "STAGE[model={} strength={} suppress={}]: in={:.6} out={:.6}",
                    current_model_name, current_config.strength, current_config.suppress_level,
                    in_peak, out_peak
                ));
            }

            // Strength mixing锛坣ormalized 鑼冨洿锛?
            if current_config.strength < 1.0 && !denoise.has_internal_strength_control() {
                for (denoised, &original) in frame.iter_mut().zip(input_frame.iter()) {
                    *denoised = original * (1.0 - current_config.strength) + *denoised * current_config.strength;
                }
            }

            // 鍣０闂紙浠?RNNoise锛孌eepFilterNet3 涓嶉渶瑕侊級
            if !denoise.has_internal_strength_control() && current_config.suppress_level > 0.01 {
                let threshold = 0.001 + current_config.suppress_level * 0.009;
                noise_gate.set_threshold(threshold);
                noise_gate.process(&mut frame);
            }

            // Denormal flush
            for sample in frame.iter_mut() {
                if !sample.is_finite() || sample.abs() < 1e-10 { *sample = 0.0; }
            }
        }

        // 鈹€鈹€ 鐩戝惉鐐?2锛氶檷鍣悗 鈹€鈹€
        monitor_write!(monitor, 2, mon_point, mon_enabled, &frame, &mut resample_buf);

        // 鈹€鈹€ 2. 澧炵泭锛堟墜鍔?or AGC 鑷姩锛夆攢鈹€
        if current_config.agc_enabled {
            // AGC 鑷姩妯″紡锛氭娴嬫ā寮忓垏鎹㈡椂閲嶇疆鐘舵€?
            if !last_agc_enabled {
                agc.reset();
                last_agc_enabled = true;
            }
            agc.process_frame(&mut frame, current_config.agc_target);
        } else {
            last_agc_enabled = false;
            for sample in frame.iter_mut() { *sample *= current_config.mic_gain; }
        }

        {
            let pg = frame.iter().fold(0.0f32, |a, &x| a.max(x.abs()));
            last_post_gain_peak_db = if pg > 1e-10 {
                20.0 * pg.log10()
            } else {
                -100.0
            };
        }

        // 鈹€鈹€ 鐩戝惉鐐?3锛氬鐩婂悗 鈹€鈹€
        monitor_write!(monitor, 3, mon_point, mon_enabled, &frame, &mut resample_buf);

        // 鈹€鈹€ 3. EQ锛堝甫鍣０闂細淇″彿鏋佸皬鏃惰烦杩?EQ锛岄槻姝?biquad 鏀惧ぇ鍣０搴曪級鈹€鈹€
        if last_eq_config.as_ref().map_or(false, |c| c.enabled) {
            let eq_input_peak = frame.iter().fold(0.0f32, |a, &x| a.max(x.abs()));
            if eq_input_peak > 0.001 {
                eq_processor.process_frame(&mut frame);
                for sample in frame.iter_mut() {
                    if !sample.is_finite() || sample.abs() < 1e-10 { *sample = 0.0; }
                }
            } else {
                // 淇″彿鏋佸皬鏃堕噸缃?EQ 鐘舵€侊紝闃叉绱Н
                eq_processor.reset_all();
            }
        }

        // 鈹€鈹€ 鐩戝惉鐐?4锛欵Q 鍚?鈹€鈹€
        monitor_write!(monitor, 4, mon_point, mon_enabled, &frame, &mut resample_buf);

        // 鈹€鈹€ 4. BGM 娣烽煶 鈹€鈹€
        if bgm_running.load(Ordering::Acquire) {
            while let Ok(data) = bgm_receiver.try_recv() {
                for &sample in &data {
                    bgm_buf.push(sample as f32 / 32768.0);
                }
            }
            // 婧㈠嚭淇濇姢锛氬凡娑堣垂閮ㄥ垎瓒呰繃涓€鍗婃椂 compact
            if bgm_read_pos > bgm_buf.len() / 2 && bgm_read_pos > 0 {
                bgm_buf.drain(..bgm_read_pos);
                bgm_read_pos = 0;
            }
            // 纭笂闄愶細鍫嗙Н杩囧鏃朵涪寮冩渶鏃ф暟鎹?
            let max_bgm = FRAME_SIZE * 20;
            if bgm_buf.len() > max_bgm {
                let excess = bgm_buf.len() - max_bgm;
                bgm_buf.drain(..excess);
                bgm_read_pos = bgm_read_pos.saturating_sub(excess);
            }
            let bgm_gain_linear = f32::from_bits(bgm_gain.load(Ordering::Relaxed)).max(0.0).min(2.0);
            if !bgm_buf.is_empty() {
                let needed = FRAME_SIZE * 2;
                if bgm_read_pos + needed <= bgm_buf.len() {
                    for i in 0..FRAME_SIZE {
                        let l = bgm_buf[bgm_read_pos + i * 2];
                        let r = bgm_buf[bgm_read_pos + i * 2 + 1];
                        let mono = (l + r) * 0.5;
                        frame[i] = frame[i] + mono * bgm_gain_linear;
                    }
                    bgm_read_pos += needed;
                }
                if bgm_read_pos >= bgm_buf.len() {
                    bgm_buf.clear();
                    bgm_read_pos = 0;
                }
            }
        }

        // 鈹€鈹€ 5. 鐖嗙偢妯″紡锛堟ā鍧楀唴閮ㄧ敤 i16 鑼冨洿甯搁噺锛岄渶杞崲锛夆攢鈹€
        if explode_enabled.load(Ordering::Acquire) {
            let mut scaled = [0.0f32; FRAME_SIZE];
            for (i, &s) in frame.iter().enumerate() { scaled[i] = s * 32767.0; }
            let mut output = [0.0f32; FRAME_SIZE];
            crate::voice::explode::process_explode_into(&scaled, &mut output, &explode_state, &mut explode_audio);
            for (i, &s) in output.iter().enumerate() { frame[i] = s / 32767.0; }
        }

        // 鈹€鈹€ 6. Soft limiter锛堢偢楹︽ā寮忎笅璺宠繃鍘嬬缉锛屽彧鍋?NaN 妫€鏌ワ級鈹€鈹€
        if !explode_enabled.load(Ordering::Acquire) {
            limiter.process(&mut frame);
        } else {
            for sample in frame.iter_mut() {
                if !sample.is_finite() { *sample = 0.0; }
            }
        }

        // 鈹€鈹€ 6.5 楂橀€氭护娉㈠櫒锛?0Hz锛屽垏闄ゆ澹版尝锛夆攢鈹€
        hpf.process(&mut frame);

        // 鈹€鈹€ 鐩戝惉鐐?5锛氭渶缁堣緭鍑猴紙limiter 鍚庯級鈹€鈹€
        monitor_write!(monitor, 5, mon_point, mon_enabled, &frame, &mut resample_buf);

        // 鐩戝惉娴佸惎鍋滄帶鍒?
        if mon_enabled {
            // 寤惰繜鍒濆鍖?
            if !mon_was_enabled {
                monitor = init_monitor(&String::new(), 48000, FRAME_SIZE);
                mon_was_enabled = true;
                debug_log(&format!(
                    "Monitor: initialized, client={}, render={}, event={}, rate={}Hz float={} ch={}",
                    monitor.client.is_some(),
                    monitor.render.is_some(),
                    monitor.event.is_some(),
                    monitor.sample_rate,
                    monitor.is_float,
                    monitor.channels
                ));
            }
            if !monitor.was_streaming && mon_point > 0 {
                if let Some(ref mut m_client) = monitor.client {
                    match m_client.start_stream() {
                        Ok(()) => {
                            monitor.was_streaming = true;
                            debug_log(&format!("Monitor: started streaming at point {}", mon_point));
                        }
                        Err(e) => {
                            debug_log(&format!("Monitor: start_stream FAILED: {:?}", e));
                        }
                    }
                } else {
                    debug_log(&format!("Monitor: cannot start - client is None, mon_point={}", mon_point));
                }
            }
        } else {
            if monitor.was_streaming {
                if let Some(ref mut m_client) = monitor.client {
                    let _ = m_client.stop_stream();
                    debug_log("Monitor: stopped streaming");
                }
                monitor.was_streaming = false;
                monitor.pending.clear();
            }
            mon_was_enabled = false;
        }

        // 鈹€鈹€ 8. 缁熻鏇存柊锛堟瘡 5 甯э級 鈹€鈹€
        // Peak / clip coach (every frame — hardware overload before AGC)
        let input_peak = input_frame.iter().fold(0.0f32, |a, &x| a.max(x.abs()));
        last_input_peak_db = if input_peak > 1e-10 {
            20.0 * input_peak.log10()
        } else {
            -100.0
        };
        if input_peak >= CLIP_THRESHOLD {
            clip_hangover = CLIP_HANGOVER_FRAMES;
        } else if clip_hangover > 0 {
            clip_hangover -= 1;
        }
        let input_clipping = clip_hangover > 0;

        if frame_count % 5 == 0 {
            // 甯ф暟鎹槸 normalized f32 [-1.0, 1.0]锛屽弬鑰冨€?1.0
            let input_rms = calculate_rms(&input_frame);
            let output_rms = calculate_rms(&frame);
            let input_level_db = if input_rms > 1e-10 {
                20.0 * input_rms.log10()
            } else {
                -100.0
            };
            let output_level_db = if output_rms > 1e-10 {
                20.0 * output_rms.log10()
            } else {
                -100.0
            };

            // 频谱累积：每 SPECTRUM_ACC_FRAMES 帧计算一次
            let acc_offset = spectrum_acc_idx * FRAME_SIZE;
            let acc_len = FRAME_SIZE * SPECTRUM_ACC_FRAMES;
            spectrum_acc_in[acc_offset..acc_offset + FRAME_SIZE].copy_from_slice(&input_frame);
            spectrum_acc_out[acc_offset..acc_offset + FRAME_SIZE].copy_from_slice(&frame);
            spectrum_acc_idx += 1;

            if spectrum_acc_idx >= SPECTRUM_ACC_FRAMES {
                spectrum_acc_idx = 0;
                let mut spectrum_buf = vec![0.0f32; 64];
                compute_spectrum_into(&spectrum_acc_in[..acc_len], &mut spectrum_buf);
                let mut spectrum_out_buf = vec![0.0f32; 64];
                compute_spectrum_into(&spectrum_acc_out[..acc_len], &mut spectrum_out_buf);

                let mut s = stats.write();
                s.input_level = input_level_db;
                s.output_level = output_level_db;
                s.input_peak = last_input_peak_db;
                s.post_gain_peak = last_post_gain_peak_db;
                s.input_clipping = input_clipping;
                s.noise_reduction_db = input_level_db - output_level_db;
                s.latency_ms = 10.0 + 10.0;
                s.frames_processed = frame_count;
                s.frames_dropped = frames_dropped;
                s.spectrum = spectrum_buf.clone();
                s.spectrum_out = spectrum_out_buf.clone();
            } else {
                // Levels still update while spectrum accumulates
                let mut s = stats.write();
                s.input_level = input_level_db;
                s.output_level = output_level_db;
                s.input_peak = last_input_peak_db;
                s.post_gain_peak = last_post_gain_peak_db;
                s.input_clipping = input_clipping;
                s.noise_reduction_db = input_level_db - output_level_db;
                s.latency_ms = 10.0 + 10.0;
                s.frames_processed = frame_count;
                s.frames_dropped = frames_dropped;
            }
        }

        // 鈹€鈹€ 9. 鎺ㄥ叆 ring B 鈹€鈹€
        if prod_b.try_push(frame).is_err() {
            // 鍓?100 甯ф槸鍚姩棰勭儹鏈燂紙render 鍒濆鍖栫瓑锛夛紝涓嶈鍏ヤ涪甯х粺璁?
            if frame_count > 100 {
                frames_dropped += 1;
            }
        }

        // 鈹€鈹€ 10. 鍋ュ悍缁熻 鈹€鈹€
        if stats_start.elapsed().as_secs() >= 5 {
            let drop_rate = frames_dropped as f64 / frame_count as f64 * 100.0;
            debug_log(&format!("HEALTH: frame={} dropped={} ({:.2}%)", frame_count, frames_dropped, drop_rate));
            stats_start = std::time::Instant::now();
            flush_debug_log();
        }
    }

    // 淇濆瓨妯″瀷鐘舵€?
    if let Some(s) = denoise.save_state() {
        if let Ok(mut states_lock) = saved_model_states.lock() {
            states_lock.insert(current_model_name, s);
        }
    }
    debug_log(&format!("dsp_thread: exiting (processed {} frames, dropped {})", frame_count, frames_dropped));
    flush_debug_log();
}