/// 爆炸模式效果预设
///
/// 每个预设定义不同的音频失真效果，用于游戏/直播中的趣味变声。

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

/// 爆炸模式效果类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum ExplodeEffect {
    /// 经典爆音：方波失真 + 音量放大
    Classic = 0,
    /// 电流声：高频噪音叠加 + 轻微失真
    Electric = 1,
    /// 破音：削波失真，音量适中但声音很脏
    Distortion = 2,
    /// 白噪音：纯噪音叠加
    WhiteNoise = 3,
    /// 机器人声：金属质感变声
    Robot = 4,
    /// 恶魔声：低沉沙哑，类似贝利亚
    Demon = 5,
    /// 回音：多重延迟回声
    Echo = 6,
}

impl ExplodeEffect {
    pub fn from_u32(val: u32) -> Self {
        match val {
            0 => Self::Classic,
            1 => Self::Electric,
            2 => Self::Distortion,
            3 => Self::WhiteNoise,
            4 => Self::Robot,
            5 => Self::Demon,
            6 => Self::Echo,
            _ => Self::Classic,
        }
    }
}

/// 爆炸模式状态（仅包含跨线程共享的原子标志）
pub struct ExplodeState {
    /// 是否启用
    pub enabled: AtomicBool,
    /// 强度 (1-100)
    pub intensity: AtomicU32,
    /// 效果类型
    pub effect_type: AtomicU32,
}

impl ExplodeState {
    pub fn new() -> Self {
        Self {
            enabled: AtomicBool::new(false),
            intensity: AtomicU32::new(50),
            effect_type: AtomicU32::new(0),
        }
    }
}

/// 爆炸模式音频线程独占状态（无需加锁）
pub struct ExplodeAudioState {
    /// 伪随机状态（白噪音/电流声用）
    pub noise_state: u32,
    /// 延迟线缓冲区（恶魔/回音共用）
    pub delay_buf: Vec<f32>,
    /// 延迟线写入位置
    pub delay_pos: usize,
    /// 上一帧的效果类型，用于检测切换时清空延迟线
    pub last_effect: u32,
}

impl ExplodeAudioState {
    pub fn new() -> Self {
        Self {
            noise_state: 12345,
            delay_buf: vec![0.0; 24000], // 500ms @ 48kHz
            delay_pos: 0,
            last_effect: 0,
        }
    }

    pub fn next_noise(&mut self) -> f32 {
        self.noise_state = self.noise_state.wrapping_mul(1103515245).wrapping_add(12345);
        let val = (self.noise_state >> 16) & 0x7FFF;
        (val as f32 / 16384.0) - 1.0
    }

    /// 效果切换或关闭时清空延迟线
    pub fn clear_delay(&mut self) {
        self.delay_buf.fill(0.0);
        self.delay_pos = 0;
    }
}

/// 处理爆炸模式效果（写入预分配的 output buffer，零堆分配）
pub fn process_explode_into(samples: &[f32], output: &mut [f32], state: &ExplodeState, audio: &mut ExplodeAudioState) {
    if !state.enabled.load(Ordering::Relaxed) {
        audio.clear_delay();
        output[..samples.len()].copy_from_slice(samples);
        return;
    }

    let intensity = (state.intensity.load(Ordering::Relaxed) as f32).clamp(1.0, 100.0);
    let effect_type = state.effect_type.load(Ordering::Relaxed);

    // 效果切换时清空延迟线
    if effect_type != audio.last_effect {
        audio.clear_delay();
        audio.last_effect = effect_type;
    }

    match ExplodeEffect::from_u32(effect_type) {
        ExplodeEffect::Classic => process_classic(samples, intensity, output),
        ExplodeEffect::Electric => process_electric(samples, intensity, audio, output),
        ExplodeEffect::Distortion => process_distortion(samples, intensity, output),
        ExplodeEffect::WhiteNoise => process_white_noise(samples, intensity, audio, output),
        ExplodeEffect::Robot => process_robot(samples, intensity, output),
        ExplodeEffect::Demon => process_demon(samples, intensity, audio, output),
        ExplodeEffect::Echo => process_echo(samples, intensity, audio, output),
    }
}

/// 经典爆音：方波失真 + 音量放大
fn process_classic(samples: &[f32], intensity: f32, output: &mut [f32]) {
    let mapped = 50.0 + intensity * 0.5;
    let gain = 1.0 + (mapped / 100.0).powf(0.6) * 49.0;
    let clip = 32000.0 - (mapped / 100.0).powf(1.5) * 31800.0;

    for (i, &s) in samples.iter().enumerate() {
        let boosted = s * gain;
        let clipped = boosted.clamp(-clip, clip);
        output[i] = clipped / clip * 32767.0;
    }
}

/// 电流声：高频方波调制 + 噪音门限（滋滋声）
fn process_electric(samples: &[f32], intensity: f32, audio: &mut ExplodeAudioState, output: &mut [f32]) {
    let mix = intensity / 100.0;
    let sample_rate = 48000.0;

    let mod_freq = 1000.0 + mix * 2000.0;
    let mod_amount = 0.5 + mix * 0.5;
    let gate_threshold = 2000.0 - mix * 1500.0;
    let noise_inject = mix * 6000.0;

    for (i, &s) in samples.iter().enumerate() {
        let t = i as f32 / sample_rate;
        let square = if (mod_freq * t).sin() > 0.0 { 1.0 } else { -1.0 };
        let modulated = s * (1.0 - mod_amount + mod_amount * square);
        let noise = if s.abs() < gate_threshold {
            audio.next_noise() * noise_inject
        } else {
            0.0
        };
        output[i] = (modulated + noise).clamp(-32767.0, 32767.0);
    }
}

/// 破音：削波失真，音量适中
fn process_distortion(samples: &[f32], intensity: f32, output: &mut [f32]) {
    let threshold = 32767.0 - (intensity / 100.0) * 28000.0;
    let gain = 1.0 + (intensity / 100.0) * 3.0;

    for (i, &s) in samples.iter().enumerate() {
        let boosted = s * gain;
        output[i] = if boosted.abs() > threshold {
            let sign = if boosted >= 0.0 { 1.0 } else { -1.0 };
            let excess = boosted.abs() - threshold;
            let compressed = threshold + excess * 0.1;
            sign * compressed
        } else {
            boosted
        };
    }
}

/// 白噪音：均匀噪音叠加（像收音机无信号）
fn process_white_noise(samples: &[f32], intensity: f32, audio: &mut ExplodeAudioState, output: &mut [f32]) {
    let noise_amount = intensity / 100.0 * 12000.0;

    for (i, &s) in samples.iter().enumerate() {
        let noise = audio.next_noise() * noise_amount;
        let mixed = s * 0.5 + noise * 0.5;
        output[i] = mixed.clamp(-32767.0, 32767.0);
    }
}

/// 机器人声：金属质感变声（通过 ring modulation）
fn process_robot(samples: &[f32], intensity: f32, output: &mut [f32]) {
    let mod_freq = 50.0 + (intensity / 100.0) * 150.0;
    let sample_rate = 48000.0;
    let mod_amount = intensity / 100.0;

    for (i, &s) in samples.iter().enumerate() {
        let t = i as f32 / sample_rate;
        let modulator = (2.0 * std::f32::consts::PI * mod_freq * t).sin();
        output[i] = (s * (1.0 - mod_amount + mod_amount * modulator)).clamp(-32767.0, 32767.0);
    }
}

/// 回音：简单延迟回声，强度控制延迟时间和反馈量
fn process_echo(samples: &[f32], intensity: f32, audio: &mut ExplodeAudioState, output: &mut [f32]) {
    // 60% 强度 = 最大效果
    let mix = (intensity / 60.0).min(1.0);
    let buf_len = audio.delay_buf.len();

    // 强度 < 5%：直通
    if mix < 0.05 {
        output[..samples.len()].copy_from_slice(samples);
        return;
    }

    // 延迟时间：10ms ~ 80ms
    let delay_ms = 10.0 + mix * 70.0;
    let delay_samples = ((delay_ms / 1000.0 * 48000.0) as usize).min(buf_len - 1);

    // 反馈：0 ~ 0.4
    let feedback = mix * 0.4;
    // 湿声增益
    let wet_gain = mix * 0.8;

    for (i, &s) in samples.iter().enumerate() {
        let read_pos = (audio.delay_pos + buf_len - delay_samples) % buf_len;
        let delayed = audio.delay_buf[read_pos];

        // 写入延迟线：输入 + 反馈
        audio.delay_buf[audio.delay_pos] = s + delayed * feedback;
        audio.delay_pos = (audio.delay_pos + 1) % buf_len;

        // 干湿混合
        output[i] = (s + delayed * wet_gain).clamp(-32767.0, 32767.0);
    }
}

/// 恶魔声：低沉沙哑 + 金属质感 + 延迟回声
fn process_demon(samples: &[f32], intensity: f32, audio: &mut ExplodeAudioState, output: &mut [f32]) {
    let mix = intensity / 100.0;
    let sample_rate = 48000.0;
    let buf_len = audio.delay_buf.len();

    // Ring modulation
    let mod_freq = 30.0 + mix * 40.0;
    let ring_mix = 0.3 + mix * 0.4;

    // 延迟
    let delay_ms = 30.0 + mix * 20.0;
    let delay_samples = ((delay_ms / 1000.0 * sample_rate) as usize).min(buf_len - 1);
    let feedback = 0.2 + mix * 0.3;
    let delay_mix = 0.15 + mix * 0.25;

    // 失真
    let drive = 1.0 + mix * 2.0;

    for (i, &s) in samples.iter().enumerate() {
        let t = i as f32 / sample_rate;

        // Ring modulation
        let modulator = (2.0 * std::f32::consts::PI * mod_freq * t).sin();
        let ring_out = s * ((1.0 - ring_mix) + ring_mix * modulator);

        // 软削波
        let driven = ring_out * drive;
        let distorted = if driven > 8000.0 {
            8000.0 + (driven - 8000.0) * 0.2
        } else if driven < -8000.0 {
            -8000.0 + (driven + 8000.0) * 0.2
        } else {
            driven
        };

        // 延迟回声
        let read_pos = (audio.delay_pos + buf_len - delay_samples) % buf_len;
        let delayed = audio.delay_buf[read_pos];
        audio.delay_buf[audio.delay_pos] = distorted + delayed * feedback;
        audio.delay_pos = (audio.delay_pos + 1) % buf_len;

        output[i] = (distorted * (1.0 - delay_mix) + delayed * delay_mix).clamp(-32767.0, 32767.0);
    }
}
