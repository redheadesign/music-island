use serde::Serialize;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex, OnceLock,
};
use tauri::{window::Color, AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};
use tokio::time::{sleep, Duration};

const OVERLAY_WIDTH: i32 = 860;
const OVERLAY_HEIGHT: u32 = 280;
const OVERLAY_TOP_OFFSET: i32 = -1;
const COLLAPSED_HEIGHT: u32 = 20;
static BOUNDS_REQUESTS: AtomicU64 = AtomicU64::new(0);
static BOUNDS_APPLIED: AtomicU64 = AtomicU64::new(0);
static GESTURE_POLLS: AtomicU64 = AtomicU64::new(0);
static GESTURE_EVENTS: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowMetrics {
    pub bounds_requests: u64,
    pub bounds_applied: u64,
    pub gesture_polls: u64,
    pub gesture_events: u64,
}

pub fn metrics() -> WindowMetrics {
    WindowMetrics {
        bounds_requests: BOUNDS_REQUESTS.load(Ordering::Relaxed),
        bounds_applied: BOUNDS_APPLIED.load(Ordering::Relaxed),
        gesture_polls: GESTURE_POLLS.load(Ordering::Relaxed),
        gesture_events: GESTURE_EVENTS.load(Ordering::Relaxed),
    }
}

fn stage_width(card_visual_width: f64) -> u32 {
    (card_visual_width.ceil() as u32 + 64).clamp(300, OVERLAY_WIDTH as u32)
}

pub fn setup_overlay_window(app: &AppHandle) -> tauri::Result<()> {
    reset_overlay_position(app)?;

    if let Some(window) = app.get_webview_window("main") {
        window.set_background_color(Some(Color(0, 0, 0, 0)))?;
        let width = stage_width(500.0);
        window.set_size(PhysicalSize::new(width, COLLAPSED_HEIGHT))?;
        window.set_always_on_top(true)?;
        window.set_skip_taskbar(true)?;
        window.set_decorations(false)?;
        window.show()?;
        set_overlay_bounds(app, false, 500.0, COLLAPSED_HEIGHT as f64)?;
    }

    Ok(())
}

pub fn reset_overlay_position(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    let monitor = window.current_monitor()?.or(window.primary_monitor()?);
    if let Some(monitor) = monitor {
        let size = monitor.size();
        let position = monitor.position();
        let current_size = window.outer_size()?;
        let x = position.x + ((size.width as i32 - current_size.width as i32) / 2).max(0);
        let y = position.y + OVERLAY_TOP_OFFSET;
        window.set_position(PhysicalPosition::new(x, y))?;
    }

    Ok(())
}

pub fn set_overlay_bounds(
    app: &AppHandle,
    expanded: bool,
    visual_width: f64,
    visual_height: f64,
) -> tauri::Result<()> {
    BOUNDS_REQUESTS.fetch_add(1, Ordering::Relaxed);
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    let width = stage_width(visual_width);
    let height = if expanded {
        (visual_height.ceil() as u32).clamp(96, OVERLAY_HEIGHT)
    } else {
        (visual_height.ceil() as u32).clamp(8, 24)
    };
    let key = (expanded, width, height);
    static LAST_BOUNDS: OnceLock<Mutex<Option<(bool, u32, u32)>>> = OnceLock::new();
    let last_bounds = LAST_BOUNDS.get_or_init(|| Mutex::new(None));
    {
        let mut previous = last_bounds.lock().expect("overlay bounds lock poisoned");
        if previous.as_ref() == Some(&key) {
            return Ok(());
        }
        *previous = Some(key);
    }

    window.set_size(PhysicalSize::new(width, height))?;

    let monitor = window.current_monitor()?.or(window.primary_monitor()?);
    if let Some(monitor) = monitor {
        let size = monitor.size();
        let position = monitor.position();
        let x = position.x + ((size.width as i32 - width as i32) / 2).max(0);
        let y = position.y + OVERLAY_TOP_OFFSET;
        window.set_position(PhysicalPosition::new(x, y))?;
    }

    set_overlay_clickthrough(app, !expanded)?;
    BOUNDS_APPLIED.fetch_add(1, Ordering::Relaxed);

    Ok(())
}

pub fn set_overlay_clickthrough(app: &AppHandle, clickthrough: bool) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    window.set_ignore_cursor_events(clickthrough)?;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollapsedGestureState {
    pub active: bool,
    pub local_x: f64,
    pub local_y: f64,
    pub client_x: i32,
    pub client_y: i32,
    pub in_top_edge: bool,
    pub window_width: f64,
    pub window_height: f64,
}

impl CollapsedGestureState {
    fn inactive() -> Self {
        Self {
            active: false,
            local_x: 0.0,
            local_y: 0.0,
            client_x: 0,
            client_y: 0,
            in_top_edge: false,
            window_width: 0.0,
            window_height: 0.0,
        }
    }
}

pub fn get_collapsed_gesture_state(app: &AppHandle) -> tauri::Result<CollapsedGestureState> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(CollapsedGestureState::inactive());
    };

    platform::collapsed_gesture_state(&window)
}

pub fn start_gesture_watcher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut previous = CollapsedGestureState::inactive();
        loop {
            GESTURE_POLLS.fetch_add(1, Ordering::Relaxed);
            let next = get_collapsed_gesture_state(&app)
                .unwrap_or_else(|_| CollapsedGestureState::inactive());
            if next != previous {
                let _ = app.emit("overlay:gesture-state", next.clone());
                GESTURE_EVENTS.fetch_add(1, Ordering::Relaxed);
                previous = next;
            }
            sleep(Duration::from_millis(if previous.active {
                33
            } else {
                100
            }))
            .await;
        }
    });
}

#[cfg(windows)]
mod platform {
    use super::CollapsedGestureState;
    use tauri::WebviewWindow;
    use windows::Win32::Foundation::{HWND, POINT, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetWindowRect};

    pub fn collapsed_gesture_state(window: &WebviewWindow) -> tauri::Result<CollapsedGestureState> {
        let native = window.hwnd()?;
        let hwnd = HWND(native.0);
        let mut bounds = RECT::default();
        let mut point = POINT::default();
        unsafe {
            if GetWindowRect(hwnd, &mut bounds).is_err() || GetCursorPos(&mut point).is_err() {
                return Ok(CollapsedGestureState::inactive());
            }
        }

        let local_x = (point.x - bounds.left) as f64;
        let local_y = (point.y - bounds.top) as f64;
        let width = (bounds.right - bounds.left).max(0) as f64;
        let height = (bounds.bottom - bounds.top).max(0) as f64;
        let active = local_x >= 0.0 && local_y >= 0.0 && local_x <= width && local_y <= height;
        if !active {
            return Ok(CollapsedGestureState::inactive());
        }
        let in_top_edge = active && local_y <= 3.0;

        Ok(CollapsedGestureState {
            active,
            local_x,
            local_y,
            client_x: point.x,
            client_y: point.y,
            in_top_edge,
            window_width: width,
            window_height: height,
        })
    }
}

#[cfg(not(windows))]
mod platform {
    use super::CollapsedGestureState;
    use tauri::WebviewWindow;

    pub fn collapsed_gesture_state(
        _window: &WebviewWindow,
    ) -> tauri::Result<CollapsedGestureState> {
        Ok(CollapsedGestureState::inactive())
    }
}

pub fn open_settings_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("settings") {
        if window.is_visible().unwrap_or(false) {
            window.hide()?;
        } else {
            window.show()?;
            let _ = window.unminimize();
            window.set_focus()?;
        }
    }

    Ok(())
}
