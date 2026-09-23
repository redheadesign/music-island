//! Preserve the insertion target without making the recording window focusable.
use std::sync::{Mutex, OnceLock};
use windows::Win32::{
    Foundation::{HWND, RECT},
    Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST},
    UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, IsWindow, SetForegroundWindow,
    },
};
#[derive(Clone, Copy, Default)]
struct Target {
    window: isize,
    process: u32,
}
static TARGET: OnceLock<Mutex<Target>> = OnceLock::new();
fn target() -> &'static Mutex<Target> {
    TARGET.get_or_init(Default::default)
}
pub fn capture() {
    unsafe {
        let window = GetForegroundWindow();
        let mut process = 0;
        GetWindowThreadProcessId(window, Some(&mut process));
        *target().lock().unwrap_or_else(|e| e.into_inner()) = if process == std::process::id() {
            Target::default()
        } else {
            Target {
                window: window.0 as isize,
                process,
            }
        };
    }
}
pub fn monitor_center() -> Option<(i32, i32)> {
    let t = *target().lock().unwrap_or_else(|e| e.into_inner());
    if t.window == 0 {
        return None;
    }
    unsafe {
        let monitor = MonitorFromWindow(HWND(t.window as *mut _), MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return None;
        }
        let RECT {
            left,
            top,
            right,
            bottom,
        } = info.rcMonitor;
        Some((left + (right - left) / 2, top + (bottom - top) / 2))
    }
}
pub fn restore() -> Result<(), String> {
    let t = *target().lock().unwrap_or_else(|e| e.into_inner());
    unsafe {
        let window = HWND(t.window as *mut _);
        let mut process = 0;
        GetWindowThreadProcessId(window, Some(&mut process));
        if t.window == 0 || !IsWindow(Some(window)).as_bool() || process != t.process {
            return Err("Target window is no longer available. Copy the text from History.".into());
        }
        if GetForegroundWindow() != window && !SetForegroundWindow(window).as_bool() {
            return Err("Could not focus the target window. Copy the text from History.".into());
        }
    }
    Ok(())
}
