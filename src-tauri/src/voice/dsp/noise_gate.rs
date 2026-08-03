/// 噪声门（Noise Gate）
///
/// 信号低于阈值时平滑衰减，防止安静时底噪被听到。
/// 支持独立的 attack（开门）和 release（关门）速度。
///
/// 用于：
/// - 降噪后的 RNNoise 噪声门（基于 suppress_level）
/// - AGC 内置噪声门（基于 VAD 阈值）
/// - EQ 前的信号极小跳过

use super::DspModule;

pub struct NoiseGate {
    /// 门状态：0.0=完全关闭，1.0=完全打开
    state: f32,
    /// 开门阈值（RMS）
    threshold: f32,
    /// 开门速度（0.0-1.0，越大越快）
    attack_speed: f32,
    /// 关门速度（0.0-1.0，越大越快）
    release_speed: f32,
}

impl NoiseGate {
    /// 创建噪声门
    ///
    /// `threshold`: 开门阈值（RMS 线性值）
    pub fn new(threshold: f32) -> Self {
        Self {
            state: 1.0, // 默认打开
            threshold,
            attack_speed: 0.15,
            release_speed: 0.03,
        }
    }

    /// 设置开门阈值
    pub fn set_threshold(&mut self, threshold: f32) {
        self.threshold = threshold;
    }

    /// 设置 attack/release 速度
    #[allow(dead_code)]
    pub fn set_speeds(&mut self, attack: f32, release: f32) {
        self.attack_speed = attack;
        self.release_speed = release;
    }

    /// 返回当前门状态（0.0-1.0）
    pub fn state(&self) -> f32 {
        self.state
    }
}

impl DspModule for NoiseGate {
    fn name(&self) -> &str {
        "NoiseGate"
    }

    fn process(&mut self, frame: &mut [f32]) {
        // 计算帧 RMS
        let rms = (frame.iter().map(|s| s * s).sum::<f32>() / frame.len() as f32).sqrt();

        // 目标状态：高于阈值开门，低于阈值关门
        let target = if rms > self.threshold { 1.0 } else { 0.0 };

        // 平滑过渡
        let speed = if target > self.state {
            self.attack_speed
        } else {
            self.release_speed
        };
        self.state += (target - self.state) * speed;

        // 应用门控衰减
        if self.state < 0.99 {
            for sample in frame.iter_mut() {
                *sample *= self.state;
            }
        }
    }

    fn reset(&mut self) {
        self.state = 1.0;
    }
}
