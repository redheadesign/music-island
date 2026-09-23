use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex, OnceLock,
};
use tauri::{
    window::Color, AppHandle, Emitter, Manager, WebviewUrl,
    WebviewWindowBuilder,
};
use tokio::time::{sleep, Duration};
pub mod monitors;

/// Extra vertical room below the collapsed strip so pull-to-open still receives samples.
const COLLAPSED_HIT_HEIGHT: f64 = 120.0;
const COLLAPSED_STRIP_HEIGHT: f64 = 24.0;
const DEFAULT_HIT_WIDTH: f64 = 612.0;
/// Leave a thin gap on left/right/bottom so auto-hide taskbars still get edge hover.
/// Do NOT inset the top — the island lives on the top edge and needs y=0 of the monitor.
const MONITOR_EDGE_GAP_PX: i32 = 2;

static BOUNDS_REQUESTS: AtomicU64 = AtomicU64::new(0);
static BOUNDS_APPLIED: AtomicU64 = AtomicU64::new(0);
static GESTURE_POLLS: AtomicU64 = AtomicU64::new(0);
static GESTURE_EVENTS: AtomicU64 = AtomicU64::new(0);
static CLICKTHROUGH: AtomicBool = AtomicBool::new(true);

#[derive(Debug, Clone, Copy)]
struct OverlayHitLayout {
    expanded: bool,
    hit_width: f64,
    hit_height: f64,
}

impl Default for OverlayHitLayout {
    fn default() -> Self {
        Self {
            expanded: false,
            hit_width: DEFAULT_HIT_WIDTH,
            hit_height: COLLAPSED_HIT_HEIGHT,
        }
    }
}

fn hit_layout() -> &'static Mutex<OverlayHitLayout> {
    static LAYOUT: OnceLock<Mutex<OverlayHitLayout>> = OnceLock::new();
    LAYOUT.get_or_init(|| Mutex::new(OverlayHitLayout::default()))
}

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

pub fn setup_overlay_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_background_color(Some(Color(0, 0, 0, 0)))?;
        window.set_always_on_top(true)?;
        window.set_skip_taskbar(true)?;
        window.set_decorations(false)?;
        fit_overlay_to_monitor(app)?;
        #[cfg(windows)] monitors::install_display_listener(&window);
        // The HWND starts hidden. React acknowledges its final viewport before first show.
        set_overlay_clickthrough_ex(app, true, true)?;
        set_overlay_bounds(app, false, DEFAULT_HIT_WIDTH, COLLAPSED_STRIP_HEIGHT)?;
    }

    Ok(())
}

pub fn reset_overlay_position(app: &AppHandle) -> tauri::Result<()> {
    fit_overlay_to_monitor(app)?;
    sync_clickthrough_from_cursor_ex(app, true)
}

fn fit_overlay_to_monitor(app: &AppHandle) -> tauri::Result<()> {
    monitors::refresh(app).map(|_| ())
}

#[tauri::command]
pub async fn show_overlay_ready(app: AppHandle, window: tauri::WebviewWindow, viewport_width: f64, viewport_height: f64) -> Result<bool, String> {
    if window.label() != "main" { return Err("Only the overlay can acknowledge its viewport".into()); }
    if app.state::<crate::install::InstallState>().newer_handoff.lock().unwrap_or_else(|e| e.into_inner()).is_some() { return Ok(true); }
    fit_overlay_to_monitor(&app).map_err(|e| e.to_string())?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    if !viewport_matches(size.width, size.height, scale, viewport_width, viewport_height) { return Ok(false); }
    window.show().map_err(|e| e.to_string())?;
    sync_clickthrough_from_cursor_ex(&app, true).map_err(|e| e.to_string())?;
    Ok(true)
}

fn viewport_matches(width: u32, height: u32, scale: f64, vw: f64, vh: f64) -> bool {
    vw.is_finite() && vh.is_finite() && scale > 0.0 && (f64::from(width) / scale - vw).abs() <= 2.0 && (f64::from(height) / scale - vh).abs() <= 2.0
}

/// Updates interaction layout only — the HWND stays monitor-sized (minus edge gaps).
pub fn set_sequenced_overlay_bounds(app: &AppHandle, expanded: bool, width: f64, height: f64, generation: Option<u64>) -> tauri::Result<()> {
    static LAST: Mutex<u64> = Mutex::new(0);
    let mut last = LAST.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(generation) = generation {
        if generation <= *last { return Ok(()); }
        *last = generation;
    }
    set_overlay_bounds(app, expanded, width, height)
}

/// Updates interaction layout only — the HWND stays monitor-sized (minus edge gaps).
/// `visual_width` / `visual_height` describe the centered hit target (card + chrome).
pub fn set_overlay_bounds(
    app: &AppHandle,
    expanded: bool,
    visual_width: f64,
    visual_height: f64,
) -> tauri::Result<()> {
    BOUNDS_REQUESTS.fetch_add(1, Ordering::Relaxed);

    let hit_width = visual_width.max(160.0);
    let hit_height = if expanded {
        visual_height.max(96.0)
    } else {
        COLLAPSED_HIT_HEIGHT
    };

    {
        let mut layout = hit_layout()
            .lock()
            .expect("overlay hit layout lock poisoned");
        let next = OverlayHitLayout {
            expanded,
            hit_width,
            hit_height,
        };
        if *layout == next {
            return Ok(());
        }
        *layout = next;
    }

    // Keep monitor coverage if the user moved monitors / DPI changed.
    fit_overlay_to_monitor(app)?;

    // Geometry changes drop WS_EX_TRANSPARENT — force re-apply, don't trust the cache.
    let _ = sync_clickthrough_from_cursor_ex(app, true);

    BOUNDS_APPLIED.fetch_add(1, Ordering::Relaxed);
    Ok(())
}

fn set_overlay_clickthrough_ex(
    app: &AppHandle,
    clickthrough: bool,
    force: bool,
) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    if !force && CLICKTHROUGH.load(Ordering::Relaxed) == clickthrough {
        return Ok(());
    }

    CLICKTHROUGH.store(clickthrough, Ordering::Relaxed);
    window.set_ignore_cursor_events(clickthrough)?;
    Ok(())
}

fn sync_clickthrough_from_cursor(app: &AppHandle) -> tauri::Result<()> {
    sync_clickthrough_from_cursor_ex(app, false)
}

fn sync_clickthrough_from_cursor_ex(app: &AppHandle, force: bool) -> tauri::Result<()> {
    let expanded = hit_layout()
        .lock()
        .map(|layout| layout.expanded)
        .unwrap_or(false);
    // Collapsed: always pass clicks through (native gesture poll still works).
    // Expanded: only capture when the cursor is over the island hit-band.
    let clickthrough = if !expanded {
        true
    } else {
        !get_collapsed_gesture_state(app)?.active
    };
    set_overlay_clickthrough_ex(app, clickthrough, force)
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

impl PartialEq for OverlayHitLayout {
    fn eq(&self, other: &Self) -> bool {
        self.expanded == other.expanded
            && (self.hit_width - other.hit_width).abs() < 0.5
            && (self.hit_height - other.hit_height).abs() < 0.5
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
        let mut monitor_check = std::time::Instant::now();
        loop {
            if monitors::take_dirty() || monitor_check.elapsed() >= Duration::from_secs(2) {
                if let Err(error) = monitors::refresh(&app) { log::debug!("Monitor refresh: {error}"); }
                monitor_check = std::time::Instant::now();
            }
            GESTURE_POLLS.fetch_add(1, Ordering::Relaxed);
            let next = get_collapsed_gesture_state(&app)
                .unwrap_or_else(|_| CollapsedGestureState::inactive());

            let _ = sync_clickthrough_from_cursor(&app);

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
    use super::{hit_layout, CollapsedGestureState, COLLAPSED_STRIP_HEIGHT};
    use tauri::WebviewWindow;
    use windows::core::w;
    use windows::Win32::Foundation::{HANDLE, HWND, POINT, RECT};
    use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetWindowRect, SetPropW};

    /// Tell Explorer this HWND is not a rude/fullscreen window so auto-hide
    /// taskbars keep their normal edge-trigger behaviour.
    pub fn mark_non_rude_hwnd(window: &WebviewWindow) {
        let Ok(native) = window.hwnd() else {
            return;
        };
        let hwnd = HWND(native.0);
        unsafe {
            let _ = SetPropW(
                hwnd,
                w!("NonRudeHWND"),
                Some(HANDLE(std::ptr::without_provenance_mut(1))),
            );
        }
    }

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

        if width <= 0.0 || height <= 0.0 {
            return Ok(CollapsedGestureState::inactive());
        }

        // Outside the fullscreen HWND (other monitor) → inactive.
        if local_x < 0.0 || local_y < 0.0 || local_x > width || local_y > height {
            return Ok(CollapsedGestureState::inactive());
        }

        let layout = *hit_layout()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        let hit_w = layout.hit_width.clamp(120.0, width);
        let hit_h = if layout.expanded {
            layout.hit_height.clamp(96.0, height)
        } else {
            layout.hit_height.clamp(COLLAPSED_STRIP_HEIGHT, height)
        };
        let left = ((width - hit_w) / 2.0).max(0.0);
        let right = left + hit_w;
        let top = 0.0;
        let bottom = hit_h;

        let active = local_x >= left && local_x <= right && local_y >= top && local_y <= bottom;
        if !active {
            return Ok(CollapsedGestureState {
                active: false,
                local_x,
                local_y,
                client_x: point.x,
                client_y: point.y,
                in_top_edge: false,
                window_width: width,
                window_height: height,
            });
        }

        let in_top_edge = local_y <= 3.0;

        Ok(CollapsedGestureState {
            active: true,
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

    pub fn mark_non_rude_hwnd(_window: &WebviewWindow) {}

    pub fn collapsed_gesture_state(
        _window: &WebviewWindow,
    ) -> tauri::Result<CollapsedGestureState> {
        Ok(CollapsedGestureState::inactive())
    }
}

pub fn setup_settings_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("settings") {
        window.set_background_color(Some(Color(9, 11, 16, 255)))?;
    }

    Ok(())
}

pub fn setup_already_running_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("already-running") {
        window.set_background_color(Some(Color(9, 11, 16, 255)))?;
        window.hide()?;
    }

    Ok(())
}

/// Full-monitor transparent intro layer. Isolated from the island overlay so
/// splash motion never touches overlay bounds / gestures.
///
/// Skipped when launched via Windows autostart (`--startup`).
pub fn setup_intro_window(app: &AppHandle) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("intro") else {
        return Ok(());
    };

    let is_autostart = std::env::args().any(|arg| arg == crate::autostart::STARTUP_ARG);
    if is_autostart {
        let _ = window.destroy();
        crate::logging::append_event("intro skipped (autostart --startup)");
        return Ok(());
    }

    window.set_background_color(Some(Color(0, 0, 0, 0)))?;
    window.set_decorations(false)?;
    window.set_always_on_top(true)?;
    window.set_skip_taskbar(true)?;
    // Purely visual — do not steal clicks from the desktop or the island.
    window.set_ignore_cursor_events(!crate::onboarding::is_onboarding())?;

    monitors::refresh(app)?;

    window.show()?;
    Ok(())
}

pub fn close_intro_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("intro") {
        window.destroy()?;
    }
    // Main overlay listens and may start the one-shot hover coach (#28).
    crate::onboarding::closed(app);
    Ok(())
}

/// Recreate and play the startup intro (dev preview / settings button).
pub fn replay_intro_window(app: &AppHandle) -> tauri::Result<()> {
    let window = if let Some(window) = app.get_webview_window("intro") {
        window
    } else {
        WebviewWindowBuilder::new(app, "intro", WebviewUrl::App("index.html".into()))
            .title("Music Island").decorations(false).transparent(true).shadow(false)
            .always_on_top(true).skip_taskbar(true).visible(false).build()?
    };

    window.set_background_color(Some(Color(0, 0, 0, 0)))?;
    window.set_ignore_cursor_events(!crate::onboarding::is_onboarding())?;

    monitors::refresh(app)?;

    window.show()?;
    crate::logging::append_event("intro window replayed");
    Ok(())
}

pub fn open_settings_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("settings") {
        if window.is_minimized().unwrap_or(false) {
            window.unminimize()?;
            window.show()?;
            window.set_focus()?;
        } else {
            window.show()?;
            window.set_focus()?;
        }
    }

    Ok(())
}

pub fn show_already_running_notice(app: &AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("already-running") {
        if window.is_minimized().unwrap_or(false) {
            window.unminimize()?;
        }
        window.center()?;
        window.show()?;
        window.set_focus()?;
    }

    Ok(())
}
pub mod taskbar;

#[cfg(test)]
mod viewport_tests {
    use super::*;
    #[test]
    fn only_show_when_the_webview_has_the_final_dpi_scaled_viewport() {
        assert!(!viewport_matches(2556, 1438, 1.25, 1280.0, 800.0));
        assert!(viewport_matches(2556, 1438, 1.25, 2045.0, 1150.0));
        assert!(!viewport_matches(1436, 2558, 1.5, 2045.0, 1150.0));
        assert!(viewport_matches(1436, 2558, 1.5, 957.0, 1705.0));
        assert!(!viewport_matches(2556, 1438, 1.25, f64::NAN, 1150.0));
    }
}
