/// WASAPI 共享模式低延迟录音。
///
/// 使用 `windows` crate 直接操作 COM/WASAPI，不依赖 `wasapi` crate。
/// 每个线程自己做 COM MTA init，确保跨线程安全。
///
/// 输出始终是 **mono f32 @ 48 kHz, 480-sample frames**。
/// 如果设备 mix format 不同，内联做 downmix + 线性重采样。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use windows::core::PCWSTR;
use windows::Win32::Foundation::WAIT_OBJECT_0;
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::*;
use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};

use crate::voice::mmcss::ProAudio;
use crate::voice::debug::debug_log;

/// 每帧样本数（10ms @ 48kHz = 480）
pub const FRAME_SAMPLES: usize = 480;
/// 目标采样率
pub const SAMPLE_RATE: u32 = 48000;

/// 帧类型：mono f32, 480 samples
pub type Frame = [f32; FRAME_SAMPLES];

#[allow(non_upper_case_globals)]
const CLSID_MMDeviceEnumerator: windows::core::GUID =
    windows::core::GUID::from_u128(0xBCDE0395_E52F_467C_8E3D_C4579291692E);

/// 录音线程产生的帧回调。必须轻量且非阻塞——推入 ring buffer 然后返回。
pub trait FrameSink: Send {
    fn on_frame(&mut self, frame: &Frame);
    fn on_glitch(&mut self, _flags: u32) {}
}

pub struct WasapiCapture {
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl WasapiCapture {
    /// 打开录音设备，开始向 sink 推送 480-sample 帧。
    /// 录音线程使用 MMCSS "Pro Audio" 调度。
    pub fn start(device_id: &str, mut sink: Box<dyn FrameSink>) -> Result<Self, String> {
        let stop = Arc::new(AtomicBool::new(false));
        let stop_thread = stop.clone();
        let device_id = device_id.to_string();

        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();

        let thread = std::thread::Builder::new()
            .name("capture-wasapi".into())
            .spawn(move || {
                if let Err(e) = capture_loop(&device_id, &mut *sink, &stop_thread, &ready_tx) {
                    log::error!("capture loop error: {}", e);
                    let _ = ready_tx.send(Err(e));
                }
            })
            .map_err(|e| format!("spawn capture thread: {}", e))?;

        // 等待线程初始化完成，同步获取错误
        ready_rx.recv().map_err(|_| "capture thread died".to_string())??;

        Ok(Self { stop, thread: Some(thread) })
    }
}

impl Drop for WasapiCapture {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

fn capture_loop(
    device_id: &str,
    sink: &mut dyn FrameSink,
    stop: &AtomicBool,
    ready_tx: &std::sync::mpsc::Sender<Result<(), String>>,
) -> Result<(), String> {
    unsafe {
        // COM MTA init（线程局部）
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&CLSID_MMDeviceEnumerator, None, CLSCTX_ALL)
            .map_err(|e| format!("CoCreateInstance(MMDeviceEnumerator): {}", e))?;

        let device = find_device(&enumerator, device_id)?;

        let client: IAudioClient3 = device.Activate(CLSCTX_ALL, None)
            .map_err(|e| format!("IMMDevice::Activate: {}", e))?;

        // GetMixFormat 返回 CoTaskMem 分配的 WAVEFORMATEX，可能是 WAVEFORMATEXTENSIBLE
        let mix_ptr = client.GetMixFormat()
            .map_err(|e| format!("GetMixFormat: {}", e))?;

        let device_rate = (*mix_ptr).nSamplesPerSec;
        let device_channels = (*mix_ptr).nChannels as usize;
        let device_bits = (*mix_ptr).wBitsPerSample;
        let needs_convert = !(device_rate == SAMPLE_RATE && device_channels == 1);

        // 检测格式类型并记录到 debug log
        let w_format_tag = (*mix_ptr).wFormatTag;
        let sub_format_str = if w_format_tag == 3 {
            "IEEE_FLOAT".to_string()
        } else if w_format_tag == 1 {
            "PCM".to_string()
        } else if w_format_tag == 0xFFFE {
            // WAVE_FORMAT_EXTENSIBLE: 检查 SubFormat
            let ext = &*(mix_ptr as *const WAVEFORMATEXTENSIBLE);
            let sub = ext.SubFormat;
            if sub == windows::core::GUID::from_u128(0x00000003_0000_0010_8000_00AA00389B71) {
                "EXT-IEEE_FLOAT".to_string()
            } else if sub == windows::core::GUID::from_u128(0x00000001_0000_0010_8000_00AA00389B71) {
                "EXT-PCM".to_string()
            } else {
                format!("EXT-{:?}", sub)
            }
        } else {
            format!("UNKNOWN({})", w_format_tag)
        };
        debug_log(&format!(
            "CAPTURE_INIT: rate={} ch={} bits={} fmt={} (tag={}) device='{}'",
            device_rate, device_channels, device_bits, sub_format_str, w_format_tag, device_id
        ));

        log::info!(
            "capture: device_rate={} channels={} bits={} convert={}",
            device_rate, device_channels, device_bits, needs_convert
        );

        // Initialize shared mode with event callback
        let init_res = client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
            0, 0, mix_ptr, None,
        );
        CoTaskMemFree(Some(mix_ptr as _));
        init_res.map_err(|e| format!("IAudioClient::Initialize: {}", e))?;

        let event = CreateEventW(None, false, false, PCWSTR::null())
            .map_err(|e| format!("CreateEventW: {}", e))?;
        client.SetEventHandle(event)
            .map_err(|e| format!("SetEventHandle: {}", e))?;

        let cap_client: IAudioCaptureClient = client.GetService()
            .map_err(|e| format!("GetService(IAudioCaptureClient): {}", e))?;

        // MMCSS Pro Audio 调度
        let _mmcss = ProAudio::set_for_current_thread();

        client.Start().map_err(|e| format!("IAudioClient::Start: {}", e))?;
        let _ = ready_tx.send(Ok(()));

        let mut accumulator = FrameAccumulator::new();
        let mut converter = if needs_convert {
            Some(InlineConverter::new(device_rate, device_channels, SAMPLE_RATE))
        } else {
            None
        };

        let mut got_first_buffer = false;
        let start_time = std::time::Instant::now();
        let mut last_silence_warn = std::time::Instant::now();

        while !stop.load(Ordering::Acquire) {
            let wait = WaitForSingleObject(event, 200);
            if wait != WAIT_OBJECT_0 {
                // 超时：检查麦克风隐私设置
                if !got_first_buffer
                    && start_time.elapsed() > std::time::Duration::from_secs(2)
                    && last_silence_warn.elapsed() > std::time::Duration::from_secs(5)
                {
                    log::error!(
                        "no audio from device after {:?}. Check Windows Settings → Privacy → Microphone",
                        start_time.elapsed()
                    );
                    last_silence_warn = std::time::Instant::now();
                }
                continue;
            }

            // drain 所有可用数据
            loop {
                let mut buffer_ptr: *mut u8 = std::ptr::null_mut();
                let mut frames_avail: u32 = 0;
                let mut flags: u32 = 0;
                let r = cap_client.GetBuffer(&mut buffer_ptr, &mut frames_avail, &mut flags, None, None);
                if let Err(e) = r {
                    if e.code() == windows::Win32::Media::Audio::AUDCLNT_S_BUFFER_EMPTY {
                        break;
                    }
                    return Err(format!("GetBuffer: {}", e));
                }
                if frames_avail == 0 {
                    let _ = cap_client.ReleaseBuffer(0);
                    break;
                }

                if !got_first_buffer {
                    log::info!("capture: first buffer received ({} frames)", frames_avail);
                    got_first_buffer = true;
                }

                if flags & (AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY.0 | AUDCLNT_BUFFERFLAGS_TIMESTAMP_ERROR.0 | AUDCLNT_BUFFERFLAGS_SILENT.0) as u32 != 0 {
                    sink.on_glitch(flags);
                }

                let sample_count = frames_avail as usize * device_channels;
                let raw = std::slice::from_raw_parts(buffer_ptr as *const f32, sample_count);

                let mono_48k: &[f32] = match converter.as_mut() {
                    None => raw,
                    Some(c) => c.process(raw, frames_avail as usize),
                };

                accumulator.feed(mono_48k, |frame| sink.on_frame(frame));

                cap_client.ReleaseBuffer(frames_avail)
                    .map_err(|e| format!("ReleaseBuffer: {}", e))?;
            }
        }

        let _ = client.Stop();
        log::info!("capture: thread exiting");
        Ok(())
    }
}

fn find_device(enumerator: &IMMDeviceEnumerator, id: &str) -> Result<IMMDevice, String> {
    unsafe {
        if id.is_empty() || id == "default" {
            debug_log("CAPTURE_DEVICE: using default communications endpoint");
            return enumerator
                .GetDefaultAudioEndpoint(eCapture, eCommunications)
                .map_err(|e| format!("GetDefaultAudioEndpoint: {}", e));
        }

        // 尝试直接用 GetDevice（需要设备 ID，不是友好名称）
        let wide: Vec<u16> = id.encode_utf16().chain(std::iter::once(0)).collect();
        match enumerator.GetDevice(PCWSTR::from_raw(wide.as_ptr())) {
            Ok(d) => {
                debug_log(&format!("CAPTURE_DEVICE: GetDevice OK for '{}'", id));
                Ok(d)
            }
            Err(_) => {
                // GetDevice 失败（传入的是友好名称），枚举设备按友好名称匹配
                debug_log(&format!("CAPTURE_DEVICE: GetDevice failed for '{}', enumerating...", id));
                let collection = enumerator.EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE)
                    .map_err(|e| format!("EnumAudioEndpoints: {}", e))?;
                let count = collection.GetCount()
                    .map_err(|e| format!("GetCount: {}", e))?;
                for i in 0..count {
                    if let Ok(dev) = collection.Item(i) {
                        if let Ok(props) = dev.OpenPropertyStore(windows::Win32::System::Com::STGM_READ) {
                            if let Ok(name_var) = props.GetValue(&windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName) {
                                let name = name_var.to_string();
                                if name == id {
                                    debug_log(&format!("CAPTURE_DEVICE: matched '{}' at index {}", name, i));
                                    return Ok(dev);
                                }
                            }
                        }
                    }
                }
                debug_log(&format!("CAPTURE_DEVICE: '{}' not found in enum, using default", id));
                enumerator.GetDefaultAudioEndpoint(eCapture, eCommunications)
                    .map_err(|e| format!("GetDefaultAudioEndpoint fallback: {}", e))
            }
        }
    }
}

/// 将任意长度的 mono f32 流攒成固定 480-sample 帧
struct FrameAccumulator {
    buf: Vec<f32>,
}

impl FrameAccumulator {
    fn new() -> Self {
        Self { buf: Vec::with_capacity(FRAME_SAMPLES * 2) }
    }

    fn feed(&mut self, samples: &[f32], mut emit: impl FnMut(&Frame)) {
        let mut i = 0;
        while i < samples.len() {
            let need = FRAME_SAMPLES - self.buf.len();
            let take = need.min(samples.len() - i);
            self.buf.extend_from_slice(&samples[i..i + take]);
            i += take;
            if self.buf.len() == FRAME_SAMPLES {
                let mut frame = [0f32; FRAME_SAMPLES];
                frame.copy_from_slice(&self.buf);
                self.buf.clear();
                emit(&frame);
            }
        }
    }
}

/// 内联 downmix + 线性重采样器
struct InlineConverter {
    src_rate: u32,
    src_channels: usize,
    dst_rate: u32,
    last_sample: f32,
    phase: f64,
    out: Vec<f32>,
}

impl InlineConverter {
    fn new(src_rate: u32, src_channels: usize, dst_rate: u32) -> Self {
        Self {
            src_rate, src_channels, dst_rate,
            last_sample: 0.0, phase: 0.0,
            out: Vec::with_capacity(2048),
        }
    }

    fn process(&mut self, interleaved: &[f32], frames: usize) -> &[f32] {
        // Step 1: downmix to mono
        let mut mono = Vec::with_capacity(frames);
        if self.src_channels == 1 {
            mono.extend_from_slice(&interleaved[..frames]);
        } else {
            for f in 0..frames {
                let base = f * self.src_channels;
                let mut acc = 0.0f32;
                for c in 0..self.src_channels {
                    acc += interleaved[base + c];
                }
                mono.push(acc / self.src_channels as f32);
            }
        }

        // Step 2: linear resample
        self.out.clear();
        if self.src_rate == self.dst_rate {
            self.out.extend_from_slice(&mono);
            self.last_sample = *mono.last().unwrap_or(&self.last_sample);
            return &self.out;
        }

        let ratio = self.src_rate as f64 / self.dst_rate as f64;
        let total_src = mono.len() as f64;
        while self.phase < total_src {
            let idx = self.phase as usize;
            let frac = self.phase - idx as f64;
            let a = if idx == 0 { self.last_sample } else { mono[idx - 1] };
            let b = mono.get(idx).copied().unwrap_or(self.last_sample);
            self.out.push((a as f64 + (b as f64 - a as f64) * frac) as f32);
            self.phase += ratio;
        }
        self.phase -= total_src;
        if let Some(&s) = mono.last() {
            self.last_sample = s;
        }
        &self.out
    }
}
