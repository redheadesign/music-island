/// AGC（Automatic Gain Control）
///
/// 设计参考：
/// - dagc（sile/dagc）：逐样本增益更新 + 外部冻结控制
/// - WebRTC AGC2（sonora-agc2）：噪声限增益 + 连续语音帧门控 + 增益速率限制
///
/// 使用独立的 `dsp::vad::VadState` 进行语音活动检测。

use crate::voice::dsp::vad::VadState;
use crate::voice::dsp::noise_gate::NoiseGate;
use crate::voice::dsp::DspModule;

/// AGC 状态（DSP 线程本地，无需线程安全）
pub struct AgcState {
    /// 当前增益（线性）
    gain: f32,
    /// VAD 模块
    vad: VadState,
    /// 噪声门模块
    noise_gate: NoiseGate,
    /// 平滑后的信号 RMS
    smoothed_rms: f32,
    /// 人声结束后保持增益冻结的剩余帧数
    hangover: u32,
    initialized: bool,
}

/// Hangover：人声结束后保持增益冻结约 1.5s（10ms/帧 ×150）
const HANGOVER_FRAMES: u32 = 150;
/// 连续语音帧阈值：增益提升前需要连续检测到的语音帧数
const ADJACENT_SPEECH_THRESHOLD: u32 = 10;
/// 最大增益上限（线性，约 +14dB）— 语音场景保守上限
const MAX_GAIN: f32 = 5.0;
/// 最小增益下限
const MIN_GAIN: f32 = 0.1;
/// 每帧最大增益下降（快压）
const MAX_GAIN_DECREASE_PER_FRAME: f32 = 0.08;
/// 每帧最大增益上升（慢恢复，约 6dB/s @ 50帧/秒）
const MAX_GAIN_INCREASE_PER_FRAME: f32 = 0.015;
/// 最大输出噪声底（线性 RMS，约 -50dB）— 超过此值时限制增益
const MAX_OUTPUT_NOISE: f32 = 0.003;

impl AgcState {
    pub fn new() -> Self {
        Self {
            gain: 1.0,
            vad: VadState::new(),
            noise_gate: NoiseGate::new(0.003),
            smoothed_rms: 0.001,
            hangover: 0,
            initialized: false,
        }
    }

    /// 重置状态（切换模式时调用）
    pub fn reset_state(&mut self) {
        self.gain = 1.0;
        self.vad.reset();
        self.noise_gate.reset();
        self.smoothed_rms = 0.001;
        self.hangover = 0;
        self.initialized = false;
    }

    /// 处理一帧
    ///
    /// `target_rms`: 目标输出电平（线性 RMS）
    pub fn process_frame(
        &mut self,
        frame: &mut [f32],
        target_rms: f32,
    ) -> f32 {
        if frame.is_empty() {
            return self.gain;
        }

        // ── 1. VAD 分析 ──
        self.vad.analyze(frame);
        let has_voice = self.vad.has_voice();
        let noise_floor = self.vad.noise_floor();

        // ── 2. 连续语音帧门控 ──
        let gain_increase_allowed =
            self.vad.adjacent_speech_count() >= ADJACENT_SPEECH_THRESHOLD;

        // ── 3. 增益更新（仅连续语音帧达标后）──
        if has_voice {
            self.hangover = HANGOVER_FRAMES;

            // 平滑 RMS
            let input_rms = self.vad.smoothed_rms();
            if !self.initialized {
                self.smoothed_rms = input_rms.max(1e-6);
                self.initialized = true;
            } else {
                let speed = if input_rms > self.smoothed_rms {
                    0.3
                } else {
                    0.05
                };
                self.smoothed_rms += (input_rms - self.smoothed_rms) * speed;
                self.smoothed_rms = self.smoothed_rms.max(1e-6);
            }

            // 目标增益 = 目标电平 / 信号电平
            let desired_gain = target_rms.max(1e-6) / self.smoothed_rms;

            // 增益变化方向判断
            let gain_diff = desired_gain - self.gain;
            if gain_diff > 0.0 && !gain_increase_allowed {
                // 连续语音帧不够，不允许增益提升
            } else {
                // 非对称：下降快、上升慢
                let speed = if gain_diff < 0.0 {
                    0.25
                } else if gain_diff.abs() > 1.0 {
                    0.08
                } else {
                    0.05
                };
                let change = gain_diff * speed;
                let clamped = if change >= 0.0 {
                    change.min(MAX_GAIN_INCREASE_PER_FRAME)
                } else {
                    change.max(-MAX_GAIN_DECREASE_PER_FRAME)
                };
                self.gain += clamped;
            }
        } else if self.hangover > 0 {
            self.hangover -= 1;
        }

        // ── 4. 增益约束 ──
        let noise_limited_max =
            (MAX_OUTPUT_NOISE / noise_floor.max(1e-7)).min(MAX_GAIN);
        let dynamic_max =
            (target_rms / noise_floor.max(1e-7)).min(noise_limited_max);
        self.gain = self.gain.clamp(MIN_GAIN, dynamic_max.max(MIN_GAIN));

        // ── 5. 应用增益 ──
        for sample in frame.iter_mut() {
            *sample *= self.gain;
        }

        // ── 6. 噪声门（基于信号电平，防止低电平噪声被放大）──
        let gate_threshold = noise_floor * 3.0;
        self.noise_gate.set_threshold(gate_threshold);
        self.noise_gate.process(frame);

        self.gain * self.noise_gate.state()
    }
}

impl DspModule for AgcState {
    fn name(&self) -> &str {
        "AGC"
    }

    fn process(&mut self, frame: &mut [f32]) {
        // 默认 target_rms，实际使用时应调用 process_frame
        self.process_frame(frame, 0.03);
    }

    fn reset(&mut self) {
        self.reset_state();
    }
}
