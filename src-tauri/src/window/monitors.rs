//! One monitor policy for the overlay and intro. Identity is independent of bounds/DPI.
use serde::Serialize;
use std::sync::{atomic::{AtomicBool, Ordering}, Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

static DIRTY: AtomicBool = AtomicBool::new(true);

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub id: String,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub primary: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorSnapshot {
    pub revision: u64,
    pub monitors: Vec<MonitorInfo>,
    pub active_id: Option<String>,
    pub preferred_id: Option<String>,
}

fn cache() -> &'static Mutex<MonitorSnapshot> {
    static CACHE: OnceLock<Mutex<MonitorSnapshot>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(MonitorSnapshot::default()))
}

pub fn invalidate() { DIRTY.store(true, Ordering::Relaxed); }
pub fn take_dirty() -> bool { DIRTY.swap(false, Ordering::Relaxed) }

fn selected<'a>(monitors: &'a [MonitorInfo], preferred: Option<&str>) -> Option<&'a MonitorInfo> {
    preferred.and_then(|id| monitors.iter().find(|monitor| monitor.id == id))
        .or_else(|| monitors.iter().find(|monitor| monitor.primary))
        .or_else(|| monitors.first())
}

fn overlay_bounds(monitor: &MonitorInfo) -> (PhysicalPosition<i32>, PhysicalSize<u32>) {
    let gap = super::MONITOR_EDGE_GAP_PX;
    (PhysicalPosition::new(monitor.x + gap, monitor.y), PhysicalSize::new(
        monitor.width.saturating_sub(2 * gap as u32).max(1),
        monitor.height.saturating_sub(gap as u32).max(1)))
}

fn enumerate(app: &AppHandle) -> tauri::Result<Vec<MonitorInfo>> {
    let primary = app.primary_monitor()?;
    let mut result = Vec::new();
    for monitor in app.available_monitors()? {
        let display = monitor.name().cloned().unwrap_or_default();
        let (id, name) = identity(&display);
        result.push(MonitorInfo { id, name, x: monitor.position().x, y: monitor.position().y,
            width: monitor.size().width, height: monitor.size().height, scale_factor: monitor.scale_factor(),
            primary: primary.as_ref().is_some_and(|p| p.position() == monitor.position()) });
    }
    // Stable ordering; Windows display numbers in names remain recognisable.
    result.sort_by(|a, b| b.primary.cmp(&a.primary).then(a.x.cmp(&b.x)).then(a.y.cmp(&b.y)));
    Ok(result)
}

fn position(window: &tauri::WebviewWindow, origin: PhysicalPosition<i32>, size: PhysicalSize<u32>) -> tauri::Result<bool> {
    let moved = window.outer_position()? != origin;
    let resized = window.inner_size()? != size;
    if resized { window.set_size(size)?; }
    if moved { window.set_position(origin)?; }
    Ok(moved || resized)
}

/// Called on startup/config changes/display events and a low-frequency recovery check.
/// Never uses current_monitor(): a spanning/stale HWND cannot change user preference.
pub fn refresh(app: &AppHandle) -> tauri::Result<MonitorSnapshot> {
    let monitors = enumerate(app)?;
    let preferred_id = app.state::<crate::config::ConfigState>().load().ok().and_then(|c| c.behavior.monitor_id);
    let target = selected(&monitors, preferred_id.as_deref());
    if let Some(target) = target {
        if let Some(window) = app.get_webview_window("main") {
            let (origin, size) = overlay_bounds(target);
            if position(&window, origin, size)? {
                super::sync_clickthrough_from_cursor_ex(app, true)?;
            }
            #[cfg(windows)] super::platform::mark_non_rude_hwnd(&window);
        }
        if let Some(intro) = app.get_webview_window("intro") {
            position(&intro, PhysicalPosition::new(target.x, target.y), PhysicalSize::new(target.width, target.height))?;
        }
    }
    let mut next = MonitorSnapshot { revision: 0, active_id: target.map(|m| m.id.clone()), preferred_id, monitors };
    let mut current = cache().lock().unwrap_or_else(|e| e.into_inner());
    next.revision = current.revision;
    if next != *current {
        next.revision += 1;
        *current = next.clone();
        drop(current);
        let _ = app.emit("window:monitors", &next);
    }
    Ok(next)
}

#[tauri::command]
pub async fn get_monitor_snapshot(app: AppHandle) -> Result<MonitorSnapshot, String> {
    refresh(&app).map_err(|e| e.to_string())
}

#[cfg(windows)]
fn identity(display: &str) -> (String, String) {
    use windows::{core::PCWSTR, Win32::Graphics::Gdi::{DISPLAY_DEVICEW, EnumDisplayDevicesW}};
    let wide: Vec<u16> = display.encode_utf16().chain(Some(0)).collect();
    let mut device = DISPLAY_DEVICEW { cb: std::mem::size_of::<DISPLAY_DEVICEW>() as u32, ..Default::default() };
    // EDD_GET_DEVICE_INTERFACE_NAME returns the monitor's device interface identity.
    if unsafe { EnumDisplayDevicesW(PCWSTR(wide.as_ptr()), 0, &mut device, 1).as_bool() } {
        let read = |s: &[u16]| String::from_utf16_lossy(&s[..s.iter().position(|c| *c == 0).unwrap_or(s.len())]);
        let id = read(&device.DeviceID);
        if !id.is_empty() {
            let number = display.rsplit("DISPLAY").next().unwrap_or(display);
            return (id.to_lowercase(), format!("{} · {}", number, read(&device.DeviceString)));
        }
    }
    (display.to_string(), display.to_string())
}

#[cfg(not(windows))]
fn identity(display: &str) -> (String, String) { (display.into(), display.into()) }

#[cfg(windows)]
pub fn install_display_listener(window: &tauri::WebviewWindow) {
    use windows::Win32::{Foundation::{HWND, LPARAM, LRESULT, WPARAM}, UI::{Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass}, WindowsAndMessaging::{WM_DEVICECHANGE, WM_DISPLAYCHANGE, WM_DPICHANGED, WM_NCDESTROY}}};
    const ID: usize = 0x4d494d;
    unsafe extern "system" fn callback(hwnd: HWND, message: u32, w: WPARAM, l: LPARAM, _: usize, _: usize) -> LRESULT {
        match message {
            WM_DISPLAYCHANGE | WM_DPICHANGED | WM_DEVICECHANGE => invalidate(),
            WM_NCDESTROY => { let _ = RemoveWindowSubclass(hwnd, Some(callback), ID); }
            _ => {}
        }
        DefSubclassProc(hwnd, message, w, l)
    }
    // Must be installed on the HWND's owning thread (setup / run_on_main_thread).
    if let Ok(hwnd) = window.hwnd() {
        if !unsafe { SetWindowSubclass(HWND(hwnd.0), Some(callback), ID, 0).as_bool() } {
            crate::logging::append_event("monitor display listener unavailable; recovery polling active");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn monitor(id: &str, x: i32, y: i32, primary: bool) -> MonitorInfo {
        MonitorInfo { id: id.into(), name: id.into(), x, y, width: 2560, height: 1440, scale_factor: 1.25, primary }
    }
    #[test]
    fn default_follows_primary_not_enumeration_or_current_window() {
        let list = vec![monitor("left", -2560, -300, false), monitor("main", 0, 0, true)];
        assert_eq!(selected(&list, None).unwrap().id, "main");
        assert_eq!(selected(&list, Some("left")).unwrap().id, "left");
    }
    #[test]
    fn disconnected_preference_falls_back_and_returns_when_reconnected() {
        let preferred = Some("left");
        let mut list = vec![monitor("main", 0, 0, true)];
        assert_eq!(selected(&list, preferred).unwrap().id, "main");
        list.push(monitor("left", -2560, 0, false));
        assert_eq!(selected(&list, preferred).unwrap().id, "left");
        assert!(selected(&[], preferred).is_none());
    }
    #[test]
    fn rotation_origin_and_dpi_change_are_part_of_snapshot() {
        let before = monitor("side", -2560, -300, false);
        assert_eq!(overlay_bounds(&before), (PhysicalPosition::new(-2558, -300), PhysicalSize::new(2556, 1438)));
        let after = MonitorInfo { width: 1440, height: 2560, scale_factor: 2.0, ..before.clone() };
        assert_ne!(before, after);
        assert_eq!(overlay_bounds(&after).1, PhysicalSize::new(1436, 2558));
        assert_eq!(selected(&[after.clone()], Some("side")), Some(&after));
    }
}
