/// WASAPI 共享模式低延迟输出。
///
/// 从 FrameSource 拉取 480-sample mono f32 帧，写入 WASAPI 输出设备。
/// 如果设备 mix format 不是 mono 48kHz f32，内联做 upmix + 线性重采样。
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use windows::core::PCWSTR;
use windows::Win32::Foundation::WAIT_OBJECT_0;
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::*;
use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};

use crate::voice::mmcss::ProAudio;
use crate::voice::wasapi_capture::{Frame, FRAME_SAMPLES, SAMPLE_RATE};

#[allow(non_upper_case_globals)]
const CLSID_MMDeviceEnumerator: windows::core::GUID =
    windows::core::GUID::from_u128(0xBCDE0395_E52F_467C_8E3D_C4579291692E);

/// 渲染线程的数据源。必须无锁/无等待，因为它在音频引擎的 tick 中被轮询。
/// 返回 None 时渲染一个周期的静音。
pub trait FrameSource: Send {
    fn next_frame(&mut self) -> Option<Frame>;
    fn on_underrun(&mut self) {}
}

pub struct WasapiRender {
    stop: Arc<AtomicBool>,
    thread: Option<std::thread::JoinHandle<()>>,
}

impl WasapiRender {
    pub fn start(device_id: &str, mut source: Box<dyn FrameSource>) -> Result<Self, String> {
        let stop = Arc::new(AtomicBool::new(false));
        let stop_thread = stop.clone();
        let device_id = device_id.to_string();
        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();

        let thread = std::thread::Builder::new()
            .name("render-wasapi".into())
            .spawn(move || {
                if let Err(e) = render_loop(&device_id, &mut *source, &stop_thread, &ready_tx) {
                    log::error!("render loop error: {}", e);
                    let _ = ready_tx.send(Err(e));
                }
            })
            .map_err(|e| format!("spawn render thread: {}", e))?;

        ready_rx
            .recv()
            .map_err(|_| "render thread died".to_string())??;
        Ok(Self {
            stop,
            thread: Some(thread),
        })
    }
}

impl Drop for WasapiRender {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

fn render_loop(
    device_id: &str,
    source: &mut dyn FrameSource,
    stop: &AtomicBool,
    ready_tx: &std::sync::mpsc::Sender<Result<(), String>>,
) -> Result<(), String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);

        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&CLSID_MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| format!("CoCreateInstance(MMDeviceEnumerator): {}", e))?;

        let device = if device_id.is_empty() {
            enumerator
                .GetDefaultAudioEndpoint(eRender, eCommunications)
                .map_err(|e| format!("GetDefaultAudioEndpoint: {}", e))?
        } else {
            // GetDevice 需要设备 ID，但我们传的是友好名称
            // 先尝试直接用 GetDevice，失败则枚举设备列表按友好名称查找
            let wide: Vec<u16> = device_id.encode_utf16().chain(std::iter::once(0)).collect();
            match enumerator.GetDevice(PCWSTR::from_raw(wide.as_ptr())) {
                Ok(d) => d,
                Err(_) => {
                    // 枚举渲染设备，按友好名称匹配
                    crate::voice::debug::debug_log_dev(&format!(
                        "RENDER: GetDevice failed for '{}', enumerating...",
                        device_id
                    ));
                    let collection = enumerator
                        .EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)
                        .map_err(|e| format!("EnumAudioEndpoints: {}", e))?;
                    let count = collection
                        .GetCount()
                        .map_err(|e| format!("GetCount: {}", e))?;
                    let mut found = None;
                    for i in 0..count {
                        if let Ok(dev) = collection.Item(i) {
                            if let Ok(props) =
                                dev.OpenPropertyStore(windows::Win32::System::Com::STGM_READ)
                            {
                                if let Ok(name_var) = props.GetValue(&windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName) {
                                    let name = name_var.to_string();
                                    if name == device_id {
                                        crate::voice::debug::debug_log_dev(&format!("RENDER: matched device '{}' at index {}", name, i));
                                        found = Some(dev);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    match found {
                        Some(d) => d,
                        None => {
                            crate::voice::debug::debug_log_dev(&format!(
                                "RENDER: device '{}' not found in enumeration, using default",
                                device_id
                            ));
                            enumerator
                                .GetDefaultAudioEndpoint(eRender, eCommunications)
                                .map_err(|e| format!("GetDefaultAudioEndpoint fallback: {}", e))?
                        }
                    }
                }
            }
        };

        let client: IAudioClient3 = device
            .Activate(CLSCTX_ALL, None)
            .map_err(|e| format!("IMMDevice::Activate: {}", e))?;

        let mix_ptr = client
            .GetMixFormat()
            .map_err(|e| format!("GetMixFormat: {}", e))?;
        let device_rate = (*mix_ptr).nSamplesPerSec;
        let device_channels = (*mix_ptr).nChannels as usize;
        let device_block_align = (*mix_ptr).nBlockAlign as u32;
        let device_bits = (*mix_ptr).wBitsPerSample;
        let device_subformat = (*mix_ptr).wFormatTag;

        log::info!(
            "render: device_rate={} channels={} block_align={} bits={} format={}",
            device_rate,
            device_channels,
            device_block_align,
            device_bits,
            device_subformat
        );
        crate::voice::debug::debug_log(&format!(
            "RENDER_INIT: rate={} ch={} block_align={} bits={} format={} device='{}'",
            device_rate,
            device_channels,
            device_block_align,
            device_bits,
            device_subformat,
            device_id
        ));

        let init_res = client.Initialize(
            AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
            0,
            0,
            mix_ptr,
            None,
        );
        CoTaskMemFree(Some(mix_ptr as _));
        init_res.map_err(|e| format!("IAudioClient::Initialize: {}", e))?;

        let event = CreateEventW(None, false, false, PCWSTR::null())
            .map_err(|e| format!("CreateEventW: {}", e))?;
        client
            .SetEventHandle(event)
            .map_err(|e| format!("SetEventHandle: {}", e))?;

        let render_client: IAudioRenderClient = client
            .GetService()
            .map_err(|e| format!("GetService(IAudioRenderClient): {}", e))?;

        let buffer_frames = client
            .GetBufferSize()
            .map_err(|e| format!("GetBufferSize: {}", e))?;

        crate::voice::debug::debug_log(&format!(
            "RENDER_BUFFER: device='{}' buffer_frames={} period_ms={:.1}",
            device_id,
            buffer_frames,
            buffer_frames as f64 / device_rate as f64 * 1000.0
        ));

        let _mmcss = ProAudio::set_for_current_thread();

        // Reset 清空所有缓冲区（包括硬件缓冲区残留数据），防止启动时回声
        let _ = client.Reset();

        // 预填充静音，避免启动时欠载
        let prefill = render_client
            .GetBuffer(buffer_frames)
            .map_err(|e| format!("GetBuffer(prefill): {}", e))?;
        std::ptr::write_bytes(prefill, 0, (buffer_frames * device_block_align) as usize);
        render_client
            .ReleaseBuffer(buffer_frames, AUDCLNT_BUFFERFLAGS_SILENT.0 as u32)
            .map_err(|e| format!("ReleaseBuffer(prefill): {}", e))?;

        client.Start().map_err(|e| format!("Start: {}", e))?;
        let _ = ready_tx.send(Ok(()));

        let mut upconverter = UpConverter::new(SAMPLE_RATE, device_rate, device_channels);
        let mut pending: Vec<f32> = Vec::with_capacity(FRAME_SAMPLES * 2);
        let mut render_tick: u64 = 0;

        while !stop.load(Ordering::Acquire) {
            let wait = WaitForSingleObject(event, 200);
            if wait != WAIT_OBJECT_0 {
                continue;
            }

            let padding = client
                .GetCurrentPadding()
                .map_err(|e| format!("GetCurrentPadding: {}", e))?;
            let frames_writable = buffer_frames.saturating_sub(padding);
            if frames_writable == 0 {
                continue;
            }

            // 拉取 mono 帧直到有足够数据填充 frames_writable
            let needed_src = ((frames_writable as u64 * SAMPLE_RATE as u64 + device_rate as u64
                - 1)
                / device_rate as u64) as usize;

            let mut got_some = 0u32;
            let mut got_none = 0u32;
            while pending.len() < needed_src {
                match source.next_frame() {
                    Some(f) => {
                        got_some += 1;
                        pending.extend_from_slice(&f);
                    }
                    None => {
                        got_none += 1;
                        source.on_underrun();
                        pending.extend(std::iter::repeat(0.0).take(FRAME_SAMPLES));
                    }
                }
            }

            render_tick += 1;
            if render_tick % 100 == 1 {
                let peak = pending.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
                crate::voice::debug::debug_log_dev(&format!(
                    "RENDER: tick={} some={} none={} pending_peak={:.6} writable={}",
                    render_tick, got_some, got_none, peak, frames_writable
                ));
            }

            let buf = render_client
                .GetBuffer(frames_writable)
                .map_err(|e| format!("GetBuffer: {}", e))?;

            let consumed = upconverter.write_into(
                &pending[..needed_src.min(pending.len())],
                buf as *mut f32,
                frames_writable as usize,
            );
            pending.drain(..consumed);

            render_client
                .ReleaseBuffer(frames_writable, 0)
                .map_err(|e| format!("ReleaseBuffer: {}", e))?;
        }

        let _ = client.Stop();
        log::info!("render: thread exiting");
        Ok(())
    }
}

/// Mono 48kHz → multi-channel device-rate f32 interleaved
struct UpConverter {
    src_rate: u32,
    dst_rate: u32,
    dst_channels: usize,
    phase: f64,
    last: f32,
}

impl UpConverter {
    fn new(src_rate: u32, dst_rate: u32, dst_channels: usize) -> Self {
        Self {
            src_rate,
            dst_rate,
            dst_channels,
            phase: 0.0,
            last: 0.0,
        }
    }

    unsafe fn write_into(&mut self, src: &[f32], dst: *mut f32, frames: usize) -> usize {
        if src.is_empty() {
            std::ptr::write_bytes(dst, 0, frames * self.dst_channels);
            return 0;
        }
        let ratio = self.src_rate as f64 / self.dst_rate as f64;
        let mut consumed_max = 0usize;
        for f in 0..frames {
            let pos = self.phase + f as f64 * ratio;
            let idx = pos as usize;
            let frac = pos - idx as f64;
            let a = if idx == 0 {
                self.last
            } else {
                src.get(idx - 1).copied().unwrap_or(self.last)
            };
            let b = src.get(idx).copied().unwrap_or(self.last);
            let s = (a as f64 + (b as f64 - a as f64) * frac) as f32;
            for c in 0..self.dst_channels {
                *dst.add(f * self.dst_channels + c) = s;
            }
            consumed_max = consumed_max.max(idx);
        }
        let advance = frames as f64 * ratio + self.phase;
        let consumed = advance as usize;
        self.phase = advance - consumed as f64;
        if consumed > 0 {
            self.last = src[(consumed - 1).min(src.len() - 1)];
        }
        consumed.min(src.len())
    }
}
