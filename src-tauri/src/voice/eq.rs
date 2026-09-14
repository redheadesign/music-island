use serde::{Deserialize, Serialize};

const NUM_BANDS: usize = 10;

/// EQ 频段中心频率（Hz）
pub const EQ_FREQUENCIES: [f32; NUM_BANDS] = [
    31.0, 62.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];

/// 预设名称
pub const EQ_PRESET_NAMES: &[&str] = &[
    "flat",
    "clear",
    "warm",
    "broadcast",
    "bass-boost",
    "treble-boost",
    "podcast",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EqConfig {
    pub enabled: bool,
    pub bands: [f32; NUM_BANDS],
}

impl Default for EqConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            bands: [0.0; NUM_BANDS],
        }
    }
}

/// 二阶 IIR 滤波器（biquad）
struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl Biquad {
    fn new() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    /// 重置内部状态（系数不变），用于 NaN 污染后恢复
    fn reset_state(&mut self) {
        self.x1 = 0.0;
        self.x2 = 0.0;
        self.y1 = 0.0;
        self.y2 = 0.0;
    }

    fn process(&mut self, input: f32) -> f32 {
        let output = self.b0 * input + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1
            - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = input;
        self.y2 = self.y1;
        self.y1 = output;
        if !output.is_finite() {
            self.reset_state();
            return 0.0;
        }
        // Denormal flush
        if self.y1.abs() < 1e-10 {
            self.y1 = 0.0;
        }
        if self.y2.abs() < 1e-10 {
            self.y2 = 0.0;
        }
        output
    }
}

/// 计算 peaking EQ 滤波器系数
/// gain_db: 增益（dB），freq: 中心频率，sample_rate: 采样率，q: 品质因数
fn peaking_eq_coefficients(
    gain_db: f32,
    freq: f32,
    sample_rate: f32,
    q: f32,
) -> (f32, f32, f32, f32, f32) {
    if gain_db.abs() < 0.01 {
        return (1.0, 0.0, 0.0, 0.0, 0.0);
    }

    let a = 10.0_f32.powf(gain_db / 20.0);
    let w0 = 2.0 * std::f32::consts::PI * freq / sample_rate;
    let sin_w0 = w0.sin();
    let cos_w0 = w0.cos();
    let alpha = sin_w0 / (2.0 * q);

    let b0 = 1.0 + alpha * a;
    let b1 = -2.0 * cos_w0;
    let b2 = 1.0 - alpha * a;
    let a0 = 1.0 + alpha / a;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha / a;

    (b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)
}

/// EQ 处理器：10 段 peaking EQ
pub struct EqProcessor {
    filters: Vec<Biquad>,
    sample_rate: f32,
}

impl EqProcessor {
    pub fn new(sample_rate: u32) -> Self {
        let mut filters = Vec::with_capacity(NUM_BANDS);
        for _ in 0..NUM_BANDS {
            filters.push(Biquad::new());
        }
        Self {
            filters,
            sample_rate: sample_rate as f32,
        }
    }

    /// 更新某一段的增益（dB）
    pub fn set_band(&mut self, index: usize, gain_db: f32) {
        if index >= NUM_BANDS {
            return;
        }
        let q = 1.414; // Butterworth Q
        let (b0, b1, b2, a1, a2) =
            peaking_eq_coefficients(gain_db, EQ_FREQUENCIES[index], self.sample_rate, q);
        let f = &mut self.filters[index];
        f.b0 = b0;
        f.b1 = b1;
        f.b2 = b2;
        f.a1 = a1;
        f.a2 = a2;
    }

    /// 应用完整 EQ 配置（清空所有 biquad 状态避免系数变更时的瞬态爆炸）
    pub fn apply_config(&mut self, config: &EqConfig) {
        for (i, &gain) in config.bands.iter().enumerate() {
            self.set_band(i, gain);
            self.filters[i].reset_state();
        }
    }

    /// 处理一帧音频（原地修改）
    pub fn process_frame(&mut self, frame: &mut [f32]) {
        for sample in frame.iter_mut() {
            let mut sum = *sample;
            for filter in self.filters.iter_mut() {
                sum = filter.process(sum);
            }
            *sample = sum;
        }
    }

    /// 重置所有 biquad 状态（信号门关闭时调用，防止状态累积）
    pub fn reset_all(&mut self) {
        for filter in self.filters.iter_mut() {
            filter.reset_state();
        }
    }
}

impl crate::voice::dsp::DspModule for EqProcessor {
    fn name(&self) -> &str {
        "EQ"
    }

    fn process(&mut self, frame: &mut [f32]) {
        self.process_frame(frame);
    }

    fn reset(&mut self) {
        self.reset_all();
    }
}

/// 获取预设的 EQ 增益值
pub fn get_preset(preset_name: &str) -> [f32; NUM_BANDS] {
    match preset_name {
        "clear" => [-2.0, -1.0, 0.0, 1.0, 2.0, 3.0, 4.0, 3.0, 2.0, 1.0],
        "warm" => [2.0, 3.0, 2.0, 1.0, 0.0, -1.0, -2.0, -3.0, -4.0, -5.0],
        "broadcast" => [3.0, 4.0, 2.0, -1.0, -2.0, -1.0, 1.0, 3.0, 4.0, 3.0],
        "bass-boost" => [4.0, 6.0, 5.0, 3.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        "treble-boost" => [0.0, 0.0, 0.0, 0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 4.0],
        "podcast" => [-3.0, -2.0, -1.0, 0.0, 2.0, 4.0, 5.0, 4.0, 2.0, 0.0],
        _ => [0.0; NUM_BANDS], // flat
    }
}
