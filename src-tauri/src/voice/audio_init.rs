#![allow(dead_code)]

/// 音频设备初始化模块
///
/// 负责 WASAPI 输入/输出/监听设备的初始化和配置。

use crate::voice::debug::{debug_log, debug_log_dev};
use crate::voice::device::find_device;
use wasapi::*;

/// 音频设备资源（输入 + 输出）
#[allow(dead_code)]
pub struct AudioDevices {
    pub input_client: AudioClient,
    pub input_capture: AudioCaptureClient,
    pub input_handle: wasapi::Handle,
    pub input_format: WaveFormat,
    pub input_device_id: String,
    pub output_client: AudioClient,
    pub output_render: AudioRenderClient,
    pub output_handle: wasapi::Handle,
    pub output_format: WaveFormat,
}

/// 监听设备状态
pub struct MonitorState {
    pub client: Option<AudioClient>,
    pub render: Option<AudioRenderClient>,
    pub event: Option<wasapi::Handle>,
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    /// true = IEEE float samples; false = PCM integer
    pub is_float: bool,
    pub buffer: Vec<u8>,
    /// Leftover mono samples not yet written (avoids mid-frame truncates → clicks)
    pub pending: Vec<f32>,
    pub current_device_id: String,
    pub was_streaming: bool,
}

/// 初始化输入/输出 WASAPI 设备，返回格式信息和客户端句柄
pub fn init_audio_devices(
    input_device_name: Option<&str>,
    output_device_name: Option<&str>,
) -> Result<AudioDevices, String> {
    let input_device = find_device(input_device_name, true)
        .map_err(|e| format!("Failed to find input device: {}", e))?;

    // 如果输入设备是 VB-Cable（用户未手动选设备时，安装 VB-Cable 会污染默认输入），自动跳过
    let input_name = input_device.get_friendlyname().unwrap_or_default();
    let input_device = if input_device_name.is_none() && is_virtual_cable(&input_name) {
        log::warn!("Default input device is '{}', skipping virtual cable", input_name);
        debug_log(&format!("Input: default '{}' is virtual cable, finding real input", input_name));
        find_first_real_capture_device()
            .map_err(|e| format!("Failed to find real input device: {}", e))?
    } else {
        input_device
    };

    let output_device = find_device(output_device_name, false)
        .map_err(|e| format!("Failed to find output device: {}", e))?;

    let input_friendly = input_device.get_friendlyname().unwrap_or_else(|_| "unknown".into());
    let output_friendly = output_device.get_friendlyname().unwrap_or_else(|_| "unknown".into());
    debug_log(&format!("Input device: '{}' id='{}'", input_friendly, input_device.get_id().unwrap_or_default()));
    debug_log(&format!("Output device: '{}' id='{}'", output_friendly, output_device.get_id().unwrap_or_default()));
    log::info!("Input device: '{}'", input_friendly);
    log::info!("Output device: '{}'", output_friendly);

    let input_device_id = input_device.get_id().unwrap_or_default();

    // 获取设备原生格式，避免 WASAPI 内部重采样增加延迟
    let fallback_input_format = WaveFormat::new(16, 16, &SampleType::Int, 48000, 1, None);
    let fallback_output_format = WaveFormat::new(16, 16, &SampleType::Int, 48000, 2, None);

    let mut input_client = input_device
        .get_iaudioclient()
        .map_err(|e| format!("Failed to get input client: {}", e))?;

    let input_format = input_client.get_mixformat().unwrap_or_else(|_| {
        log::warn!("Failed to get input mixformat, using fallback 48kHz");
        fallback_input_format
    });
    log::info!(
        "Input device format: {}Hz, {}ch, {}bit, {:?}",
        input_format.get_samplespersec(),
        input_format.get_nchannels(),
        input_format.get_bitspersample(),
        input_format.get_subformat().unwrap_or(SampleType::Int)
    );

    let (def_time, min_time) = input_client
        .get_device_period()
        .map_err(|e| format!("Failed to get input periods: {}", e))?;
    log::info!("Input periods: default={}us, min={}us", def_time / 10, min_time / 10);
    debug_log(&format!("Input periods: default={}us, min={}us", def_time / 10, min_time / 10));

    // 输入用最小缓冲区，减少延迟
    let input_mode = StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns: min_time,
    };
    input_client
        .initialize_client(&input_format, &Direction::Capture, &input_mode)
        .map_err(|e| format!("Failed to initialize input client: {}", e))?;

    let input_handle = input_client
        .set_get_eventhandle()
        .map_err(|e| format!("Failed to set input event handle: {}", e))?;

    let mut output_client = output_device
        .get_iaudioclient()
        .map_err(|e| format!("Failed to get output client: {}", e))?;

    let output_format = output_client.get_mixformat().unwrap_or_else(|_| {
        log::warn!("Failed to get output mixformat, using fallback 48kHz");
        fallback_output_format
    });
    log::info!(
        "Output device format: {}Hz, {}ch, {}bit, {:?}",
        output_format.get_samplespersec(),
        output_format.get_nchannels(),
        output_format.get_bitspersample(),
        output_format.get_subformat().unwrap_or(SampleType::Int)
    );

    let (def_time, min_time) = output_client
        .get_device_period()
        .map_err(|e| format!("Failed to get output periods: {}", e))?;
    log::info!("Output periods: default={}us, min={}us", def_time / 10, min_time / 10);
    debug_log(&format!("Output periods: default={}us, min={}us", def_time / 10, min_time / 10));

    // 输出用默认缓冲区（~10ms），输出线程通过 wait_event 与设备时钟同步
    let output_mode = StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns: def_time,
    };
    output_client
        .initialize_client(&output_format, &Direction::Render, &output_mode)
        .map_err(|e| format!("Failed to initialize output client: {}", e))?;
    log::info!("Output client initialized on '{}'", output_friendly);

    let output_handle = output_client
        .set_get_eventhandle()
        .map_err(|e| format!("Failed to set output event handle: {}", e))?;

    let input_capture = input_client
        .get_audiocaptureclient()
        .map_err(|e| format!("Failed to get input capture client: {}", e))?;

    let output_render = output_client
        .get_audiorenderclient()
        .map_err(|e| format!("Failed to get output render client: {}", e))?;

    Ok(AudioDevices {
        input_client,
        input_capture,
        input_handle,
        input_format,
        input_device_id,
        output_client,
        output_render,
        output_handle,
        output_format,
    })
}

/// 枚举所有录音设备，返回第一个非 VB-Cable 的设备
fn find_first_real_capture_device() -> Result<Device, String> {
    let enumerator = DeviceEnumerator::new()
        .map_err(|e| format!("Failed to create device enumerator: {}", e))?;
    let collection = enumerator
        .get_device_collection(&Direction::Capture)
        .map_err(|e| format!("Failed to get capture device collection: {}", e))?;

    for result in collection.into_iter() {
        if let Ok(dev) = result {
            let name = dev.get_friendlyname().unwrap_or_default();
            if !is_virtual_cable(&name) {
                debug_log(&format!("Input: found real device '{}'", name));
                return Ok(dev);
            }
        }
    }
    Err("No real capture device found".into())
}

/// 检查设备是否为 VB-Audio Virtual Cable（虚拟声卡不适合做监听输出）
fn is_virtual_cable(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains("cable input") || lower.contains("cable output") || lower.contains("vb-audio")
}

/// 枚举所有输出设备，跳过 VB-Cable 和与输入同 USB 的设备，返回第一个可用的
fn find_monitor_device(input_device_id: &str) -> Result<Device, String> {
    use wasapi::Direction;

    let enumerator = DeviceEnumerator::new()
        .map_err(|e| format!("Failed to create device enumerator: {}", e))?;
    let collection = enumerator
        .get_device_collection(&Direction::Render)
        .map_err(|e| format!("Failed to get render device collection: {}", e))?;

    // 先尝试默认设备
    if let Ok(default) = enumerator.get_default_device(&Direction::Render) {
        let name = default.get_friendlyname().unwrap_or_default();
        let id = default.get_id().unwrap_or_default();
        if !is_virtual_cable(&name) && !is_same_usb_device(&id, input_device_id) {
            debug_log(&format!("Monitor: using default device '{}'", name));
            return Ok(default);
        }
        debug_log(&format!("Monitor: default device '{}' skipped (virtual cable or same USB)", name));
    }

    // 默认设备不可用，遍历所有设备找非 VB-Cable 的
    for (i, result) in collection.into_iter().enumerate() {
        if let Ok(dev) = result {
            let name = dev.get_friendlyname().unwrap_or_default();
            let id = dev.get_id().unwrap_or_default();
            if !is_virtual_cable(&name) && !is_same_usb_device(&id, input_device_id) {
                debug_log(&format!("Monitor: fallback to device '{}' (index={})", name, i));
                return Ok(dev);
            }
        }
    }

    Err("No suitable monitor output device found (all devices are virtual cables or same USB)".into())
}

/// 检查两个设备 ID 是否共享同一个 USB VID/PID
fn is_same_usb_device(id_a: &str, id_b: &str) -> bool {
    let extract_usb_id = |id: &str| -> String {
        if let Some(start) = id.find("vid_") {
            let rest = &id[start..];
            if let Some(end) = rest.find('&') {
                if let Some(pid_start) = rest.find("pid_") {
                    let pid_rest = &rest[pid_start..];
                    if let Some(pid_end) = pid_rest.find(|c: char| c == '&' || c == '#') {
                        return rest[..end + pid_end].to_string();
                    }
                }
            }
        }
        String::new()
    };
    let a = extract_usb_id(id_a);
    let b = extract_usb_id(id_b);
    !a.is_empty() && a == b
}

/// 初始化监听客户端（非 VB-Cable 的输出设备）
pub fn init_monitor(
    input_device_id: &str,
    output_sample_rate: u32,
    frame_size: usize,
) -> MonitorState {
    // Prefer DSP rate (48 kHz) float stereo so monitor taps match capture frames 1:1.
    // WASAPI autoconvert handles the device's native rate/format.
    let _ = output_sample_rate;
    let monitor_max_frames = frame_size * 4;
    let mut state = MonitorState {
        client: None,
        render: None,
        event: None,
        sample_rate: 48000,
        channels: 2,
        bits_per_sample: 32,
        is_float: true,
        buffer: vec![0u8; monitor_max_frames * 2 * 4],
        pending: Vec::with_capacity(frame_size * 4),
        current_device_id: String::new(),
        was_streaming: false,
    };

    debug_log(&format!(
        "Monitor: looking for output device... input_device_id={}",
        input_device_id
    ));
    match find_monitor_device(input_device_id) {
        Ok(monitor_output) => {
            let device_id = monitor_output.get_id().unwrap_or_default();
            let device_name = monitor_output.get_friendlyname().unwrap_or_default();
            debug_log(&format!("Monitor: selected device '{}' id='{}'", device_name, device_id));

            if let Ok(mut m_client) = monitor_output.get_iaudioclient() {
                let preferred =
                    WaveFormat::new(32, 32, &SampleType::Float, 48000, 2, None);
                let mix = m_client.get_mixformat().ok();
                let (def_time, _) = m_client.get_device_period().unwrap_or((0, 0));
                let monitor_mode = StreamMode::EventsShared {
                    autoconvert: true,
                    buffer_duration_hns: def_time,
                };

                // Try DSP-matched format first; fall back to device mix format.
                let mut opened = m_client
                    .initialize_client(&preferred, &Direction::Render, &monitor_mode)
                    .is_ok();
                let mut used_rate = 48000u32;
                let mut used_channels = 2u16;
                let mut used_bits = 32u16;
                let mut used_float = true;

                if !opened {
                    if let Some(ref mix_fmt) = mix {
                        debug_log(&format!(
                            "Monitor: 48k float init failed on '{}', falling back to mixformat {}Hz",
                            device_name,
                            mix_fmt.get_samplespersec()
                        ));
                        opened = m_client
                            .initialize_client(mix_fmt, &Direction::Render, &monitor_mode)
                            .is_ok();
                        if opened {
                            used_rate = mix_fmt.get_samplespersec();
                            used_channels = mix_fmt.get_nchannels();
                            used_bits = mix_fmt.get_bitspersample();
                            used_float = matches!(
                                mix_fmt.get_subformat().unwrap_or(SampleType::Float),
                                SampleType::Float
                            );
                        }
                    }
                }

                if opened {
                    if let Ok(render) = m_client.get_audiorenderclient() {
                        let evt = m_client.set_get_eventhandle();

                        let buf_size = m_client.get_buffer_size().unwrap_or(0);
                        let frame_bytes =
                            (used_bits as usize / 8).max(1) * used_channels as usize;
                        let silent = vec![0u8; buf_size as usize * frame_bytes.max(1)];
                        let _ = render.write_to_device(buf_size as usize, &silent, None);
                        debug_log(&format!(
                            "Monitor: prefilled {} silent frames ({} bytes)",
                            buf_size,
                            silent.len()
                        ));

                        log::info!(
                            "Monitor client ready on '{}' (format: {}bit, {}Hz, float={}, buffer={})",
                            device_name,
                            used_bits,
                            used_rate,
                            used_float,
                            buf_size
                        );
                        debug_log(&format!(
                            "Monitor: READY on '{}' ({}Hz, float={}, ch={}, bits={}, evt_ok={})",
                            device_name,
                            used_rate,
                            used_float,
                            used_channels,
                            used_bits,
                            evt.is_ok()
                        ));
                        state.client = Some(m_client);
                        state.render = Some(render);
                        state.event = evt.ok();
                        state.current_device_id = device_id;
                        state.sample_rate = used_rate;
                        state.channels = used_channels;
                        state.bits_per_sample = used_bits;
                        state.is_float = used_float;
                        let max_frames = frame_size
                            .saturating_mul((used_rate as usize / 24000).max(2))
                            .saturating_mul(4);
                        let bytes_per_sample = (state.bits_per_sample as usize / 8).max(1);
                        state.buffer =
                            vec![0u8; max_frames * state.channels as usize * bytes_per_sample];
                    } else {
                        debug_log(&format!(
                            "Monitor: failed to get render client on '{}'",
                            device_name
                        ));
                    }
                } else {
                    debug_log(&format!(
                        "Monitor: failed to initialize client on '{}'",
                        device_name
                    ));
                }
            } else {
                debug_log(&format!("Monitor: failed to get AudioClient on '{}'", device_name));
            }
        }
        Err(e) => {
            debug_log(&format!(
                "Monitor: failed to find default output device: {}",
                e
            ));
        }
    }

    state
}

/// WASAPI 流启动预热：等待设备真正就绪
pub fn warmup_streams(
    input_client: &AudioClient,
    input_handle: &wasapi::Handle,
    input_capture: &AudioCaptureClient,
    input_bytes_per_frame: usize,
    frame_size: usize,
) {
    debug_log_dev("Starting warmup...");
    let warmup_buf_size = frame_size * input_bytes_per_frame;
    let mut warmup_buf = vec![0u8; warmup_buf_size];
    let max_retries = 3;
    let mut warmup_ok = false;

    for attempt in 0..max_retries {
        debug_log_dev(&format!("Warmup attempt {}/{}", attempt + 1, max_retries));
        let warmup_start = std::time::Instant::now();
        let mut warmup_frames = 0;
        let mut got_signal = false;

        while warmup_start.elapsed().as_millis() < 300 {
            if input_handle.wait_for_event(50).is_ok() {
                if let Ok((frames_read, _)) = input_capture.read_from_device(&mut warmup_buf) {
                    if frames_read > 0 {
                        warmup_frames += 1;
                        let bytes_read = frames_read as usize * input_bytes_per_frame;
                        if warmup_buf[..bytes_read].iter().any(|&b| b != 0) {
                            got_signal = true;
                            break;
                        }
                    }
                }
            }
        }

        if got_signal {
            debug_log_dev(&format!(
                "Warmup OK: {} frames, {}ms",
                warmup_frames,
                warmup_start.elapsed().as_millis()
            ));
            warmup_ok = true;
            break;
        }

        debug_log_dev(&format!(
            "Warmup attempt {} failed, restarting streams...",
            attempt + 1
        ));
        let _ = input_client.stop_stream();
        std::thread::sleep(std::time::Duration::from_millis(100));
        let _ = input_client.start_stream();
    }

    if !warmup_ok {
        debug_log_dev("All warmup attempts failed!");
    }
    debug_log_dev("Entering main audio loop");
}
