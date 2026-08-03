/// 软限幅器（Soft Limiter）
///
/// 对超过阈值的信号进行软压缩，防止硬削波。
/// 阈值以上用可配置的压缩比处理，超过硬限幅值直接钳位。
///
/// 默认参数（参考 audio_engine.rs 原始实现）：
/// - 阈值: 0.73（约 -2.7dB）
/// - 压缩比: 10:1
/// - 硬限幅: 0.92（约 -0.7dB）

use super::DspModule;

pub struct SoftLimiter {
    threshold: f32,
    ratio: f32,
    hard_limit: f32,
}

impl SoftLimiter {
    /// 创建软限幅器
    ///
    /// `threshold`: 压缩起始阈值（线性，如 0.73）
    /// `ratio`: 压缩比（如 10.0 表示 10:1）
    /// `hard_limit`: 硬限幅值（线性，如 0.92）
    pub fn new(threshold: f32, ratio: f32, hard_limit: f32) -> Self {
        Self {
            threshold,
            ratio: ratio.max(1.0),
            hard_limit,
        }
    }

    /// 默认参数：阈值 0.73，压缩比 10:1，硬限 0.92
    pub fn default_limiter() -> Self {
        Self::new(0.73, 10.0, 0.92)
    }
}

impl DspModule for SoftLimiter {
    fn name(&self) -> &str {
        "Limiter"
    }

    fn process(&mut self, frame: &mut [f32]) {
        for sample in frame.iter_mut() {
            if sample.is_finite() {
                let abs = sample.abs();
                if abs > self.threshold {
                    let compressed =
                        self.threshold + (abs - self.threshold) / self.ratio;
                    *sample = sample.signum() * compressed.min(self.hard_limit);
                }
                if !sample.is_finite() {
                    *sample = 0.0;
                }
            } else {
                *sample = 0.0;
            }
        }
    }

    fn reset(&mut self) {
        // 无状态，无需重置
    }
}
