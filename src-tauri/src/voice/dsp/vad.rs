/// 语音活动检测（Voice Activity Detection）
///
/// 基于噪声底估计的 VAD，输出语音概率和连续语音帧计数。
/// 参考 WebRTC AGC2 的 VAD 设计：
/// - 噪声底追踪：指数移动最小值
/// - 自适应阈值：VAD 阈值 = max(噪声底 × 倍数, 最低阈值)
/// - 连续帧门控：统计连续检测到语音的帧数

/// VAD 状态（DSP 线程本地）
pub struct VadState {
    /// 噪声底估计（线性 RMS）
    noise_floor: f32,
    /// 平滑后的信号 RMS
    smoothed_rms: f32,
    /// 连续检测到语音的帧数
    adjacent_speech_count: u32,
    /// 上一帧是否检测到语音
    last_has_voice: bool,
}

/// 噪声底自适应速度（上调慢，下调快）
const NOISE_FLOOR_ADAPT_UP: f32 = 0.005;
const NOISE_FLOOR_ADAPT_DOWN: f32 = 0.1;
/// 信号需超过噪声底多少倍才算人声
const VAD_ABOVE_NOISE: f32 = 6.0;
/// 最低 VAD 阈值（防止噪声底极低时阈值也极低）
const VAD_MIN_THRESHOLD: f32 = 0.002;

impl VadState {
    pub fn new() -> Self {
        Self {
            noise_floor: 0.001,
            smoothed_rms: 0.001,
            adjacent_speech_count: 0,
            last_has_voice: false,
        }
    }

    /// 重置状态
    pub fn reset(&mut self) {
        self.noise_floor = 0.001;
        self.smoothed_rms = 0.001;
        self.adjacent_speech_count = 0;
        self.last_has_voice = false;
    }

    /// 分析一帧，更新内部状态
    ///
    /// `frame`: normalized f32 [-1.0, 1.0] 音频帧
    pub fn analyze(&mut self, frame: &[f32]) {
        if frame.is_empty() {
            return;
        }

        let rms = (frame.iter().map(|s| s * s).sum::<f32>() / frame.len() as f32).sqrt();

        // 噪声底追踪：只在信号低于当前噪声底×2 时更新
        if rms < self.noise_floor * 2.0 {
            let adapt = if rms < self.noise_floor {
                NOISE_FLOOR_ADAPT_DOWN
            } else {
                NOISE_FLOOR_ADAPT_UP
            };
            self.noise_floor += (rms - self.noise_floor) * adapt;
        }
        self.noise_floor = self.noise_floor.max(1e-7);

        // VAD 判断
        let has_voice = rms > self.vad_threshold();

        // 连续语音帧计数
        if has_voice {
            self.adjacent_speech_count = self.adjacent_speech_count.saturating_add(1);
        } else {
            self.adjacent_speech_count = 0;
        }

        // 平滑 RMS
        let speed = if rms > self.smoothed_rms { 0.3 } else { 0.05 };
        self.smoothed_rms += (rms - self.smoothed_rms) * speed;
        self.smoothed_rms = self.smoothed_rms.max(1e-6);

        self.last_has_voice = has_voice;
    }

    /// VAD 阈值（自适应）
    pub fn vad_threshold(&self) -> f32 {
        (self.noise_floor * VAD_ABOVE_NOISE).max(VAD_MIN_THRESHOLD)
    }

    /// 是否检测到语音
    pub fn has_voice(&self) -> bool {
        self.last_has_voice
    }

    /// 连续语音帧计数
    pub fn adjacent_speech_count(&self) -> u32 {
        self.adjacent_speech_count
    }

    /// 当前噪声底估计
    pub fn noise_floor(&self) -> f32 {
        self.noise_floor
    }

    /// 平滑后的信号 RMS
    pub fn smoothed_rms(&self) -> f32 {
        self.smoothed_rms
    }
}
