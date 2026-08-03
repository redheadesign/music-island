//! MMCSS (Multimedia Class Scheduler) + process priority for live voice.
//! Under screen-share / browser load, normal threads get 2–10ms stalls → audible glitches.
//! VoIP apps register "Pro Audio" + raise process class so mic DSP wins the CPU.

use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(windows)]
static PROCESS_BOOSTED: AtomicBool = AtomicBool::new(false);

/// Raise whole-process priority while the voice engine is live (same idea as Task Manager → High).
#[cfg(windows)]
pub fn boost_process_for_voice() {
    use windows::Win32::System::Threading::{
        GetCurrentProcess, SetPriorityClass, HIGH_PRIORITY_CLASS,
    };
    unsafe {
        if SetPriorityClass(GetCurrentProcess(), HIGH_PRIORITY_CLASS).is_ok() {
            PROCESS_BOOSTED.store(true, Ordering::Release);
            log::info!("voice: process priority → HIGH");
        } else {
            log::warn!("voice: SetPriorityClass(HIGH) failed");
        }
    }
}

#[cfg(windows)]
pub fn restore_process_priority() {
    use windows::Win32::System::Threading::{
        GetCurrentProcess, SetPriorityClass, NORMAL_PRIORITY_CLASS,
    };
    if !PROCESS_BOOSTED.swap(false, Ordering::AcqRel) {
        return;
    }
    unsafe {
        if SetPriorityClass(GetCurrentProcess(), NORMAL_PRIORITY_CLASS).is_ok() {
            log::info!("voice: process priority → NORMAL");
        }
    }
}

#[cfg(not(windows))]
pub fn boost_process_for_voice() {}

#[cfg(not(windows))]
pub fn restore_process_priority() {}

#[cfg(windows)]
pub struct ProAudio(windows::Win32::Foundation::HANDLE);

#[cfg(windows)]
impl ProAudio {
    pub fn set_for_current_thread() -> Option<Self> {
        use windows::core::w;
        use windows::Win32::System::Threading::{
            AvSetMmThreadCharacteristicsW, AvSetMmThreadPriority, AVRT_PRIORITY_CRITICAL,
        };

        unsafe {
            let mut task_index: u32 = 0;
            match AvSetMmThreadCharacteristicsW(w!("Pro Audio"), &mut task_index) {
                Ok(h) if !h.is_invalid() => {
                    // Critical within Pro Audio — preferred path for low-latency WASAPI/VoIP.
                    let _ = AvSetMmThreadPriority(h, AVRT_PRIORITY_CRITICAL);
                    Some(Self(h))
                }
                _ => {
                    log::warn!("AvSetMmThreadCharacteristicsW failed; running at normal priority");
                    None
                }
            }
        }
    }
}

#[cfg(windows)]
impl Drop for ProAudio {
    fn drop(&mut self) {
        use windows::Win32::System::Threading::AvRevertMmThreadCharacteristics;
        unsafe {
            let _ = AvRevertMmThreadCharacteristics(self.0);
        }
    }
}
