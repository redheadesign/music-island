/// DSP 模块统一接口
///
/// 所有音频处理模块实现此 trait，提供公共的 name/process/reset 方法。
/// 各模块保留自己的专用方法（如 AGC 的 process_frame 需要 target_rms），
/// DspModule 只提供基础生命周期管理。

/// DSP 模块基础 trait
#[allow(dead_code)]
pub trait DspModule {
    /// 模块名称（用于日志/调试）
    fn name(&self) -> &str;

    /// 处理一帧（就地修改 normalized f32 [-1.0, 1.0]）
    fn process(&mut self, frame: &mut [f32]);

    /// 重置内部状态（切换设备/重启时调用）
    fn reset(&mut self);
}

pub mod hpf;
pub mod limiter;
pub mod noise_gate;
pub mod vad;
