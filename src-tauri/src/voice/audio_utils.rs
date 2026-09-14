#![allow(dead_code)]
use rustfft::{num_complex::Complex, FftPlanner};
use std::sync::atomic::{AtomicU64, Ordering};
use wasapi::*;

static MONITOR_FAIL_COUNT: AtomicU64 = AtomicU64::new(0);
static MONITOR_FAIL_FIRST_TIME: AtomicU64 = AtomicU64::new(0);
static MONITOR_FAIL_LAST_LOG: AtomicU64 = AtomicU64::new(0);

const DSP_SAMPLE_RATE: u32 = 48000;

pub fn calculate_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum: f32 = samples.iter().map(|&s| s * s).sum();
    (sum / samples.len() as f32).sqrt()
}

/// FFT spectrum into preallocated buffer. Input: normalized f32 [-1, 1]. Output: 0–1.
pub fn compute_spectrum_into(samples: &[f32], output: &mut [f32]) {
    let n = samples.len();
    let bands = output.len();
    if n == 0 || bands == 0 {
        output.fill(0.0);
        return;
    }

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(n);

    let mut buffer: Vec<Complex<f32>> = samples
        .iter()
        .enumerate()
        .map(|(i, &s)| {
            let w = 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / n as f32).cos());
            Complex::new(s * w, 0.0)
        })
        .collect();

    fft.process(&mut buffer);

    let half_n = n / 2;
    let freq_per_bin = 48000.0f32 / n as f32;
    const FREQ_MIN: f32 = 20.0;
    const FREQ_MAX: f32 = 24000.0;

    let mut band_edges: Vec<usize> = Vec::with_capacity(bands + 1);
    for i in 0..=bands {
        let t = i as f32 / bands as f32;
        let freq = FREQ_MIN * (FREQ_MAX / FREQ_MIN).powf(t);
        let bin = ((freq / freq_per_bin) as usize).min(half_n);
        band_edges.push(bin);
    }

    const MIN_DB: f32 = -80.0;
    const MAX_DB: f32 = -10.0;

    for i in 0..bands {
        let start = band_edges[i];
        let end = band_edges[i + 1].max(start + 1);

        let mut peak_mag = 0.0f32;
        for bin in start..end {
            if bin >= half_n {
                break;
            }
            let mag = (buffer[bin].re * buffer[bin].re + buffer[bin].im * buffer[bin].im).sqrt();
            let normalized = mag / n as f32;
            if normalized > peak_mag {
                peak_mag = normalized;
            }
        }

        let db = if peak_mag > 1e-10 {
            20.0 * peak_mag.log10()
        } else {
            MIN_DB
        };

        let val = ((db - MIN_DB) / (MAX_DB - MIN_DB)).max(0.0).min(1.0);
        output[i] = val;
    }
}

/// Write mono f32 DSP frames to the monitor device.
/// Resamples when the monitor client is not 48 kHz; queues leftovers to avoid clicks.
pub fn write_to_monitor(
    samples: &[f32],
    render_opt: &Option<AudioRenderClient>,
    event_opt: &Option<wasapi::Handle>,
    client_opt: &Option<AudioClient>,
    monitor_buffer: &mut [u8],
    monitor_sample_rate: u32,
    resample_buf: &mut Vec<f32>,
    pending: &mut Vec<f32>,
    channels: u16,
    bits_per_sample: u16,
    is_float: bool,
) {
    let render = match render_opt {
        Some(r) => r,
        None => return,
    };

    let dst_rate = if monitor_sample_rate == 0 {
        DSP_SAMPLE_RATE
    } else {
        monitor_sample_rate
    };

    let src: &[f32] = if dst_rate != DSP_SAMPLE_RATE {
        let need = ((samples.len() as f64) * (dst_rate as f64) / (DSP_SAMPLE_RATE as f64)).ceil()
            as usize
            + 8;
        if resample_buf.len() < need {
            resample_buf.resize(need, 0.0);
        }
        let n = resample_in_place(samples, DSP_SAMPLE_RATE, dst_rate, resample_buf);
        &resample_buf[..n]
    } else {
        samples
    };

    pending.extend_from_slice(src);
    let max_pending = (dst_rate as usize / 25).max(480);
    if pending.len() > max_pending {
        let drop = pending.len() - max_pending;
        pending.drain(..drop);
    }

    if let Some(evt) = event_opt {
        let _ = evt.wait_for_event(5);
    }

    let writable = if let Some(client) = client_opt {
        match client.get_available_space_in_frames() {
            Ok(n) => n as usize,
            Err(_) => return,
        }
    } else {
        pending.len()
    };
    if writable == 0 || pending.is_empty() {
        return;
    }

    let frames_to_write = pending.len().min(writable);
    let bytes_per_sample = (bits_per_sample as usize / 8).max(1);
    let bytes_per_frame = channels as usize * bytes_per_sample;
    let total_bytes = frames_to_write * bytes_per_frame;
    if total_bytes > monitor_buffer.len() {
        return;
    }

    for i in 0..frames_to_write {
        let sample = pending[i];
        match (bits_per_sample, is_float) {
            (32, true) => {
                let bytes = sample.to_le_bytes();
                for ch in 0..channels as usize {
                    let pos = i * bytes_per_frame + ch * 4;
                    monitor_buffer[pos..pos + 4].copy_from_slice(&bytes);
                }
            }
            (32, false) => {
                let val = (sample * 2147483647.0).clamp(-2147483648.0, 2147483647.0) as i32;
                let bytes = val.to_le_bytes();
                for ch in 0..channels as usize {
                    let pos = i * bytes_per_frame + ch * 4;
                    monitor_buffer[pos..pos + 4].copy_from_slice(&bytes);
                }
            }
            (16, _) => {
                let val = (sample * 32767.0).clamp(-32768.0, 32767.0) as i16;
                let bytes = val.to_le_bytes();
                for ch in 0..channels as usize {
                    let pos = i * bytes_per_frame + ch * 2;
                    monitor_buffer[pos..pos + 2].copy_from_slice(&bytes);
                }
            }
            (24, _) => {
                let val = (sample * 8388607.0).clamp(-8388608.0, 8388607.0) as i32;
                let b0 = (val & 0xFF) as u8;
                let b1 = ((val >> 8) & 0xFF) as u8;
                let b2 = ((val >> 16) & 0xFF) as u8;
                for ch in 0..channels as usize {
                    let pos = i * bytes_per_frame + ch * 3;
                    monitor_buffer[pos] = b0;
                    monitor_buffer[pos + 1] = b1;
                    monitor_buffer[pos + 2] = b2;
                }
            }
            _ => {
                let bytes = sample.to_le_bytes();
                for ch in 0..channels as usize {
                    let pos = i * bytes_per_frame + ch * bytes_per_sample.min(4);
                    let end = (pos + 4).min(monitor_buffer.len());
                    if end > pos {
                        let n = end - pos;
                        monitor_buffer[pos..end].copy_from_slice(&bytes[..n]);
                    }
                }
            }
        }
    }

    pending.drain(..frames_to_write);

    if let Err(e) = render.write_to_device(frames_to_write, &monitor_buffer[..total_bytes], None) {
        let count = MONITOR_FAIL_COUNT.fetch_add(1, Ordering::Relaxed);
        let now_sec = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        if count == 0 {
            MONITOR_FAIL_FIRST_TIME.store(now_sec, Ordering::Relaxed);
            MONITOR_FAIL_LAST_LOG.store(now_sec, Ordering::Relaxed);
            crate::voice::debug::debug_log(&format!(
                "Monitor write FAILED: frames={} ch={} bits={} float={} rate={} err={:?}",
                frames_to_write, channels, bits_per_sample, is_float, dst_rate, e
            ));
        } else {
            let last_log = MONITOR_FAIL_LAST_LOG.load(Ordering::Relaxed);
            if now_sec.saturating_sub(last_log) >= 10 {
                let start = MONITOR_FAIL_FIRST_TIME.load(Ordering::Relaxed);
                let elapsed = now_sec.saturating_sub(start);
                crate::voice::debug::debug_log(&format!(
                    "Monitor write FAILED: {} times in {}s (last err={:?})",
                    count + 1,
                    elapsed,
                    e
                ));
                MONITOR_FAIL_LAST_LOG.store(now_sec, Ordering::Relaxed);
            }
        }
    }
}

pub fn resample_in_place(input: &[f32], from_rate: u32, to_rate: u32, output: &mut [f32]) -> usize {
    if from_rate == to_rate || input.is_empty() {
        let len = input.len().min(output.len());
        output[..len].copy_from_slice(&input[..len]);
        return len;
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let output_len = (input.len() as f64 / ratio) as usize;
    let output_len = output_len.min(output.len());
    for i in 0..output_len {
        let src_pos = i as f64 * ratio;
        let src_idx = src_pos as usize;
        let frac = src_pos - src_idx as f64;
        output[i] = if src_idx + 1 < input.len() {
            input[src_idx] * (1.0 - frac as f32) + input[src_idx + 1] * frac as f32
        } else {
            input[src_idx]
        };
    }
    output_len
}

pub fn bytes_to_f32_samples_into(
    buf: &[u8],
    bits: u16,
    sample_type: &SampleType,
    _channels: usize,
    output: &mut [f32],
) -> usize {
    match (bits, sample_type) {
        (8, SampleType::Int) => {
            let len = buf.len().min(output.len());
            for (i, &b) in buf.iter().take(len).enumerate() {
                output[i] = (b as i16 - 128) as f32 * 128.0;
            }
            len
        }
        (16, SampleType::Int) => {
            let len = (buf.len() / 2).min(output.len());
            for (i, c) in buf.chunks_exact(2).take(len).enumerate() {
                output[i] = i16::from_le_bytes([c[0], c[1]]) as f32;
            }
            len
        }
        (24, SampleType::Int) => {
            let len = (buf.len() / 3).min(output.len());
            for (i, c) in buf.chunks_exact(3).take(len).enumerate() {
                let val = (c[0] as i32) | ((c[1] as i32) << 8) | ((c[2] as i32) << 16);
                let val = if val & 0x800000 != 0 {
                    val | 0xFF000000u32 as i32
                } else {
                    val
                };
                output[i] = (val >> 8) as f32;
            }
            len
        }
        (32, SampleType::Int) => {
            let len = (buf.len() / 4).min(output.len());
            for (i, c) in buf.chunks_exact(4).take(len).enumerate() {
                let val = i32::from_le_bytes([c[0], c[1], c[2], c[3]]);
                output[i] = (val >> 16) as f32;
            }
            len
        }
        (32, SampleType::Float) => {
            let len = (buf.len() / 4).min(output.len());
            for (i, c) in buf.chunks_exact(4).take(len).enumerate() {
                output[i] = f32::from_le_bytes([c[0], c[1], c[2], c[3]]) * 32767.0;
            }
            len
        }
        (64, SampleType::Float) => {
            let len = (buf.len() / 8).min(output.len());
            for (i, c) in buf.chunks_exact(8).take(len).enumerate() {
                output[i] = f64::from_le_bytes([c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7]])
                    as f32
                    * 32767.0;
            }
            len
        }
        _ => {
            log::warn!(
                "Unsupported audio format: {}bit {:?}, falling back to 16bit",
                bits,
                sample_type
            );
            let len = (buf.len() / 2).min(output.len());
            for (i, c) in buf.chunks_exact(2).take(len).enumerate() {
                output[i] = i16::from_le_bytes([c[0], c[1]]) as f32;
            }
            len
        }
    }
}

pub fn downmix_to_mono_into(samples: &[f32], channels: usize, output: &mut [f32]) -> usize {
    if channels <= 1 {
        let len = samples.len().min(output.len());
        output[..len].copy_from_slice(&samples[..len]);
        return len;
    }
    let mut count = 0;
    for frame in samples.chunks(channels) {
        if count >= output.len() {
            break;
        }
        output[count] = frame.iter().sum::<f32>() / channels as f32;
        count += 1;
    }
    count
}
