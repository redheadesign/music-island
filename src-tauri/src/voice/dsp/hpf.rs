/// 高通滤波器（High Pass Filter）
///
/// 一阶 IIR 高通滤波器，切除低频隆隆声和直流偏移。
/// 默认截止频率 80Hz @ 48kHz 采样率。
///
/// 算法：y[n] = α * (y[n-1] + x[n] - x[n-1])

use super::DspModule;

pub struct HighPassFilter {
    x_prev: f32,
    y_prev: f32,
    alpha: f32,
}

impl HighPassFilter {
    /// 创建高通滤波器
    ///
    /// `cutoff_hz`: 截止频率（Hz）
    /// `sample_rate`: 采样率（Hz）
    pub fn new(cutoff_hz: f32, sample_rate: f32) -> Self {
        let rc = 1.0 / (2.0 * std::f32::consts::PI * cutoff_hz);
        let dt = 1.0 / sample_rate;
        let alpha = rc / (rc + dt);
        Self {
            x_prev: 0.0,
            y_prev: 0.0,
            alpha,
        }
    }

    /// 默认 80Hz @ 48kHz
    pub fn default_48k() -> Self {
        Self::new(80.0, 48000.0)
    }
}

impl DspModule for HighPassFilter {
    fn name(&self) -> &str {
        "HPF"
    }

    fn process(&mut self, frame: &mut [f32]) {
        for sample in frame.iter_mut() {
            let x = *sample;
            let y = self.alpha * (self.y_prev + x - self.x_prev);
            *sample = y;
            self.x_prev = x;
            self.y_prev = y;
        }
        // Denormal flush
        if !self.x_prev.is_finite() || self.x_prev.abs() < 1e-10 {
            self.x_prev = 0.0;
        }
        if !self.y_prev.is_finite() || self.y_prev.abs() < 1e-10 {
            self.y_prev = 0.0;
        }
    }

    fn reset(&mut self) {
        self.x_prev = 0.0;
        self.y_prev = 0.0;
    }
}
