//! An opt-in native player in a verified empty portion of the taskbar.
//! Explorer moves/clips our child; native buttons dispatch to the media provider.

mod geometry;
#[cfg(windows)]
mod native_player;

use parking_lot::Mutex;
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    OnceLock,
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskbarStatus {
    pub state: &'static str,
}

fn current_status() -> &'static Mutex<TaskbarStatus> {
    static STATUS: OnceLock<Mutex<TaskbarStatus>> = OnceLock::new();
    STATUS.get_or_init(|| Mutex::new(TaskbarStatus { state: "off" }))
}

pub fn status() -> TaskbarStatus {
    current_status().lock().clone()
}

fn publish(app: &AppHandle, state: &'static str) {
    let next = TaskbarStatus { state };
    let mut current = current_status().lock();
    if *current == next {
        return;
    }
    *current = next.clone();
    drop(current);
    let _ = app.emit("taskbar:status", next);
}

fn enabled(app: &AppHandle) -> bool {
    app.try_state::<crate::config::ConfigState>()
        .is_some_and(|state| state.taskbar_enabled())
}

/// Creates the native player only when enabled and a safe gap is confirmed.
pub fn start(app: AppHandle) {
    static STARTED: AtomicBool = AtomicBool::new(false);
    if STARTED.swap(true, Ordering::AcqRel) {
        return;
    }
    let failure_app = app.clone();
    if let Err(error) = std::thread::Builder::new()
        .name("taskbar-watch".into())
        .spawn(move || {
            platform::watch(app);
        })
    {
        log::warn!("Taskbar watcher could not start: {error}");
        publish(&failure_app, "error");
        STARTED.store(false, Ordering::Release);
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;
    pub(super) fn watch(app: AppHandle) {
        loop {
            publish(&app, if enabled(&app) { "unsupported" } else { "off" });
            std::thread::sleep(std::time::Duration::from_secs(1));
        }
    }
}

#[cfg(windows)]
mod platform {
    use super::{
        enabled,
        geometry::{self, Rect},
        native_player, publish, AppHandle,
    };
    use parking_lot::Mutex;
    use std::{
        mem::size_of,
        sync::{
            atomic::{AtomicBool, Ordering},
            mpsc, Arc,
        },
        time::{Duration, Instant},
    };
    use tauri::{Listener, Manager};
    use windows::{
        core::{w, BOOL},
        Win32::{
            Foundation::{HWND, LPARAM, LRESULT, POINT, RECT, WPARAM},
            Graphics::Gdi::{
                ClientToScreen, GetMonitorInfoW, MonitorFromWindow, MONITORINFO,
                MONITOR_DEFAULTTONULL,
            },
            System::Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
                COINIT_MULTITHREADED,
            },
            UI::{
                Accessibility::{
                    CUIAutomation, IUIAutomation, IUIAutomationElement, TreeScope_Descendants,
                    UIA_ButtonControlTypeId, UIA_ListItemControlTypeId, UIA_PaneControlTypeId,
                },
                HiDpi::{
                    AreDpiAwarenessContextsEqual, GetDpiForWindow, GetThreadDpiAwarenessContext,
                    GetWindowDpiAwarenessContext,
                },
                Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
                WindowsAndMessaging::{
                    EnumChildWindows, FindWindowW, GetClassNameW, GetClientRect, GetParent,
                    GetWindowLongPtrW, GetWindowRect, GetWindowThreadProcessId, IsWindow,
                    IsWindowVisible, SetParent, SetWindowLongPtrW, SetWindowPos, ShowWindow,
                    GWL_EXSTYLE, GWL_STYLE, HWND_TOP, MA_NOACTIVATE, SET_WINDOW_POS_FLAGS,
                    SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER,
                    SWP_SHOWWINDOW, SW_HIDE, WM_MOUSEACTIVATE, WM_NCDESTROY, WS_CHILD,
                    WS_EX_APPWINDOW, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_POPUP,
                    WS_VISIBLE,
                },
            },
        },
    };

    const TICK: Duration = Duration::from_millis(500);
    const SNAPSHOT_TTL: Duration = Duration::from_millis(1500);
    const UIA_SCAN_INTERVAL: Duration = Duration::from_millis(1250);
    static REFRESH_PENDING: AtomicBool = AtomicBool::new(false);
    static PLACEMENT_PENDING: AtomicBool = AtomicBool::new(false);

    #[derive(Clone, Debug, PartialEq, Eq)]
    struct Shell {
        hwnd: usize,
        pid: u32,
        rect: Rect,
        screen_rect: Rect,
        revealed: bool,
        monitor: Rect,
        dpi: u32,
        app_host: Rect,
        occupied: Vec<Rect>,
    }

    impl Shell {
        fn same_shell(&self, other: &Self) -> bool {
            self.same_layout(other) && self.occupied == other.occupied
        }

        fn same_layout(&self, other: &Self) -> bool {
            self.hwnd == other.hwnd
                && self.pid == other.pid
                && self.rect == other.rect
                && self.screen_rect.left == other.screen_rect.left
                && self.monitor == other.monitor
                && self.dpi == other.dpi
                && self.app_host == other.app_host
        }
    }

    #[derive(Clone, Copy)]
    struct Attachment {
        hwnd: usize,
        parent: usize,
        parent_pid: u32,
        dpi: u32,
        rect: Option<Rect>,
        options: native_player::PlayerOptions,
    }

    fn attachment() -> &'static Mutex<Option<Attachment>> {
        static ATTACHED: std::sync::OnceLock<Mutex<Option<Attachment>>> =
            std::sync::OnceLock::new();
        ATTACHED.get_or_init(|| Mutex::new(None))
    }

    struct Scan {
        shell: Shell,
        requested: Instant,
        occupied: Result<Vec<Rect>, ()>,
    }

    struct ScanRequest {
        shell: Shell,
        requested: Instant,
    }

    #[derive(Clone)]
    struct Plan {
        state: &'static str,
        shell: Option<Shell>,
        rect: Option<Rect>,
        requested: Option<Instant>,
        retain: bool,
        logical_width: i32,
    }

    impl Plan {
        fn hidden(state: &'static str) -> Self {
            Self {
                state,
                shell: None,
                rect: None,
                requested: None,
                retain: false,
                logical_width: geometry::PLAYER_WIDTH.round() as i32,
            }
        }
    }

    /// A gap outside the ENTIRE native app host needs no UIA traversal. Protect
    /// the whole host here; only the slower scan is allowed to use its empty tail.
    #[cfg(test)]
    fn plan_from_native(shell: Shell, previous: Option<&Plan>) -> Option<Plan> {
        plan_from_native_sized(shell, previous, geometry::PLAYER_WIDTH.round() as i32)
    }

    fn plan_from_native_sized(
        shell: Shell,
        previous: Option<&Plan>,
        logical_width: i32,
    ) -> Option<Plan> {
        let mut occupied = shell.occupied.clone();
        occupied.push(shell.app_host);
        let previous_rect = previous
            .filter(|plan| {
                plan.shell
                    .as_ref()
                    .is_some_and(|old| old.same_layout(&shell))
            })
            .filter(|plan| plan.logical_width == logical_width)
            .and_then(|plan| plan.rect);
        // Only UIA may validate a tail INSIDE a stretched app host. Outside that
        // host, recompute every native change so the player follows both tray
        // growth and shrink while keeping its stable right-side clearance.
        if previous_rect.is_some_and(|rect| {
            rect.left < shell.app_host.right && rect.right > shell.app_host.left
        }) {
            return None;
        }
        let rect = geometry::place_sized(shell.rect, &occupied, shell.dpi, logical_width)?;
        Some(Plan {
            state: if shell.revealed { "visible" } else { "hidden" },
            shell: Some(shell),
            rect: Some(rect),
            requested: Some(Instant::now()),
            retain: false,
            logical_width,
        })
    }

    #[cfg(test)]
    fn plan_from_scan(shell: Shell, latest: Option<&Scan>, previous: Option<&Plan>) -> Plan {
        plan_from_scan_sized(
            shell,
            latest,
            previous,
            geometry::PLAYER_WIDTH.round() as i32,
        )
    }

    fn plan_from_scan_sized(
        shell: Shell,
        latest: Option<&Scan>,
        previous: Option<&Plan>,
        logical_width: i32,
    ) -> Plan {
        let previous = previous.filter(|plan| {
            plan.logical_width == logical_width
                && plan
                    .shell
                    .as_ref()
                    .is_some_and(|old| old.same_layout(&shell))
                && plan.rect.is_some_and(|rect| {
                    geometry::still_clear_sized(
                        shell.rect,
                        &shell.occupied,
                        shell.dpi,
                        rect,
                        logical_width,
                    )
                })
        });
        let retain = |fallback| match previous {
            Some(previous) => Plan {
                state: if shell.revealed { "visible" } else { "hidden" },
                shell: Some(shell.clone()),
                retain: true,
                ..previous.clone()
            },
            None => Plan::hidden(fallback),
        };
        // Hidden/offscreen UIA providers may omit buttons or report a stretched
        // host instead. This is not evidence that the verified gap was occupied.
        // Keep an existing child prepared; Explorer owns its reveal and clipping.
        if !shell.revealed && previous.is_some() {
            return retain("hidden");
        }
        match latest.filter(|scan| scan.shell.same_shell(&shell)) {
            None => retain("hidden"),
            Some(scan) if scan.requested.elapsed() > SNAPSHOT_TTL => retain("error"),
            Some(Scan {
                occupied: Err(()), ..
            }) => retain("error"),
            Some(scan) if !scan.shell.revealed && previous.is_some() => retain("hidden"),
            Some(Scan {
                occupied: Ok(occupied),
                requested,
                ..
            }) => {
                let mut all = shell.occupied.clone();
                all.extend(occupied.iter().copied());
                // A fresh snapshot is authoritative. Recompute the right-side
                // anchor even when the old rectangle remains clear, so removing
                // tray icons returns the player to the tray boundary.
                let rect = geometry::place_sized(shell.rect, &all, shell.dpi, logical_width);
                match rect {
                    Some(rect) => Plan {
                        state: if shell.revealed { "visible" } else { "hidden" },
                        shell: Some(shell),
                        rect: Some(rect),
                        requested: Some(*requested),
                        retain: false,
                        logical_width,
                    },
                    None => Plan::hidden("no-space"),
                }
            }
        }
    }

    pub(super) fn watch(app: AppHandle) {
        // One listener for metadata/state; no timeline subscription or extra poll.
        // Native publication holds the provider lock, so read its cache only after
        // dispatch to the UI thread, never synchronously inside the emit callback.
        for event in [
            "media:update",
            "config:changed",
            "direct:status",
            "smtc:health",
        ] {
            let event_app = app.clone();
            app.listen(event, move |_| {
                if !enabled(&event_app) || REFRESH_PENDING.swap(true, Ordering::AcqRel) {
                    return;
                }
                let update_app = event_app.clone();
                if event_app
                    .run_on_main_thread(move || {
                        REFRESH_PENDING.store(false, Ordering::Release);
                        refresh_native_player(&update_app);
                    })
                    .is_err()
                {
                    REFRESH_PENDING.store(false, Ordering::Release);
                }
            });
        }
        let snapshot = Arc::new(Mutex::new(None::<Scan>));
        let (send, receive) = mpsc::sync_channel::<ScanRequest>(1);
        let scan_snapshot = snapshot.clone();
        let worker = std::thread::Builder::new()
            .name("taskbar-uia".into())
            .spawn(move || {
                // No HWNDs or Tauri operations on this MTA. An unresponsive provider
                // can stall only this one worker; existing verified children are
                // retained only while their native shell layout stays unchanged.
                let initialized = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok();
                let automation: Option<IUIAutomation> = if initialized {
                    unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) }.ok()
                } else {
                    None
                };
                let mut failed = false;
                while let Ok(request) = receive.recv() {
                    let result = automation
                        .as_ref()
                        .ok_or(())
                        .and_then(|uia| scan_controls(uia, &request.shell));
                    if result.is_err() && !failed {
                        log::debug!("Taskbar UI Automation snapshot unavailable");
                    }
                    failed = result.is_err();
                    *scan_snapshot.lock() = Some(Scan {
                        shell: request.shell,
                        requested: request.requested,
                        occupied: result,
                    });
                }
                drop(automation);
                if initialized {
                    unsafe {
                        CoUninitialize();
                    }
                }
            });
        let worker_available = worker.is_ok();
        let mut verified = None::<Plan>;
        let mut last_scan_request = None::<(Shell, Instant)>;
        loop {
            let is_enabled = enabled(&app);
            let logical_width = native_player::logical_width(player_options(&app));
            let plan = if !is_enabled {
                *snapshot.lock() = None;
                verified = None;
                last_scan_request = None;
                Plan::hidden("off")
            } else if !worker_available {
                Plan::hidden("error")
            } else {
                match discover_shell() {
                    Err(state) => verified
                        .as_ref()
                        .and_then(|previous| {
                            previous
                                .shell
                                .as_ref()
                                .and_then(hidden_parent_frame)
                                .map(|shell| Plan {
                                    state: "hidden",
                                    shell: Some(shell),
                                    retain: true,
                                    ..previous.clone()
                                })
                        })
                        .unwrap_or_else(|| Plan::hidden(state)),
                    Ok(shell) => {
                        if let Some(plan) =
                            plan_from_native_sized(shell.clone(), verified.as_ref(), logical_width)
                        {
                            plan
                        } else {
                            // Offscreen UIA cannot improve an already verified gap.
                            // Resume discovery as soon as Explorer reveals it.
                            let scan_due = last_scan_request.as_ref().is_none_or(|(last, at)| {
                                !last.same_shell(&shell) || at.elapsed() >= UIA_SCAN_INTERVAL
                            });
                            if (shell.revealed || verified.is_none()) && scan_due {
                                let request = ScanRequest {
                                    shell: shell.clone(),
                                    requested: Instant::now(),
                                };
                                if send.try_send(request).is_ok() {
                                    last_scan_request = Some((shell.clone(), Instant::now()));
                                }
                            }
                            let latest = snapshot.lock();
                            plan_from_scan_sized(
                                shell,
                                latest.as_ref(),
                                verified.as_ref(),
                                logical_width,
                            )
                        }
                    }
                }
            };
            if plan.rect.is_some() {
                verified = Some(plan.clone());
            } else if matches!(plan.state, "off" | "no-space" | "unsupported") {
                verified = None;
            }
            let ui_app = app.clone();
            if !PLACEMENT_PENDING.swap(true, Ordering::AcqRel) {
                if app
                    .run_on_main_thread(move || {
                        PLACEMENT_PENDING.store(false, Ordering::Release);
                        apply(&ui_app, plan);
                    })
                    .is_err()
                {
                    PLACEMENT_PENDING.store(false, Ordering::Release);
                    break;
                }
            }
            std::thread::sleep(if is_enabled {
                TICK
            } else {
                Duration::from_secs(1)
            });
        }
    }

    fn from_native(r: RECT) -> Rect {
        Rect {
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
        }
    }

    fn native_rect(hwnd: HWND) -> Result<Rect, ()> {
        let mut rect = RECT::default();
        unsafe { GetWindowRect(hwnd, &mut rect) }.map_err(|_| ())?;
        let result = from_native(rect);
        result.valid().then_some(result).ok_or(())
    }

    fn client_frame(hwnd: HWND) -> Result<(Rect, Rect), ()> {
        let mut client = RECT::default();
        unsafe { GetClientRect(hwnd, &mut client) }.map_err(|_| ())?;
        let mut origin = POINT { x: 0, y: 0 };
        if !unsafe { ClientToScreen(hwnd, &mut origin) }.as_bool() {
            return Err(());
        }
        let rect = from_native(client);
        if !rect.valid() {
            return Err(());
        }
        Ok((
            rect,
            Rect {
                left: origin.x,
                top: origin.y,
                right: origin.x.saturating_add(rect.width()),
                bottom: origin.y.saturating_add(rect.height()),
            },
        ))
    }

    /// Explorer can temporarily omit layout children during auto-hide. Keeping
    /// an already attached window is safe while this SAME parent's frame is
    /// itself hidden/offscreen; never infer new visible placement from this.
    fn hidden_parent_frame(expected: &Shell) -> Option<Shell> {
        unsafe {
            let parent = FindWindowW(w!("Shell_TrayWnd"), None).ok()?;
            let mut pid = 0;
            GetWindowThreadProcessId(parent, Some(&mut pid));
            let (rect, screen_rect) = client_frame(parent).ok()?;
            let monitor = MonitorFromWindow(parent, MONITOR_DEFAULTTONULL);
            let mut info = MONITORINFO {
                cbSize: size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if monitor.0.is_null() || !GetMonitorInfoW(monitor, &mut info).as_bool() {
                return None;
            }
            let monitor = from_native(info.rcMonitor);
            let current = Shell {
                hwnd: parent.0 as usize,
                pid,
                rect,
                screen_rect,
                revealed: IsWindowVisible(parent).as_bool() && monitor.contains(screen_rect),
                monitor,
                dpi: GetDpiForWindow(parent),
                ..expected.clone()
            };
            (!current.revealed && current.same_shell(expected)).then_some(current)
        }
    }

    fn scan_frame_matches(shell: &Shell, client: Rect, screen: Rect, visible: bool) -> bool {
        client == shell.rect
            && screen == shell.screen_rect
            && (visible && shell.monitor.contains(screen)) == shell.revealed
    }

    fn validate_scan_frame(shell: &Shell) -> Result<(), ()> {
        let parent = HWND(shell.hwnd as *mut _);
        let (client, screen) = client_frame(parent)?;
        (scan_frame_matches(shell, client, screen, unsafe {
            IsWindowVisible(parent).as_bool()
        }) && unsafe { GetDpiForWindow(parent) } == shell.dpi)
            .then_some(())
            .ok_or(())
    }

    fn is_our_subtree(mut hwnd: HWND) -> bool {
        for _ in 0..24 {
            // Read-only test probes run in a different process from the player.
            // Match the enabled app's own child so discovery has the same
            // self-exclusion semantics as the production watcher.
            #[cfg(test)]
            if tests::is_running_player(hwnd) {
                return true;
            }
            let mut pid = 0;
            unsafe {
                GetWindowThreadProcessId(hwnd, Some(&mut pid));
            }
            if pid == std::process::id() {
                return true;
            }
            match unsafe { GetParent(hwnd) } {
                Ok(parent) => hwnd = parent,
                Err(_) => return false,
            }
        }
        false
    }

    fn class_name(hwnd: HWND) -> String {
        let mut buffer = [0_u16; 256];
        let len = unsafe { GetClassNameW(hwnd, &mut buffer) };
        String::from_utf16_lossy(&buffer[..len.max(0) as usize])
    }

    struct Child {
        class: String,
        rect: Rect,
    }

    fn visible_inside_taskbar(mut hwnd: HWND) -> bool {
        for _ in 0..24 {
            if class_name(hwnd) == "Shell_TrayWnd" {
                return true;
            }
            if unsafe { GetWindowLongPtrW(hwnd, GWL_STYLE) } & WS_VISIBLE.0 as isize == 0 {
                return false;
            }
            match unsafe { GetParent(hwnd) } {
                Ok(parent) => hwnd = parent,
                Err(_) => return false,
            }
        }
        false
    }

    unsafe extern "system" fn collect_child(hwnd: HWND, data: LPARAM) -> BOOL {
        let children = &mut *(data.0 as *mut Vec<Child>);
        if children.len() >= 256 {
            return BOOL(0);
        }
        // Once embedded, our WebView and its browser subprocess windows also
        // appear here. Exclude the entire subtree to avoid self-collision.
        if visible_inside_taskbar(hwnd) && !is_our_subtree(hwnd) {
            if let Ok(rect) = native_rect(hwnd) {
                children.push(Child {
                    class: class_name(hwnd),
                    rect,
                });
            }
        }
        BOOL(1)
    }

    fn discover_shell() -> Result<Shell, &'static str> {
        unsafe {
            let hwnd = FindWindowW(w!("Shell_TrayWnd"), None).map_err(|_| "hidden")?;
            let parent_visible = IsWindowVisible(hwnd).as_bool();
            let (rect, screen_rect) = client_frame(hwnd).map_err(|_| "hidden")?;
            if rect.height() >= rect.width() {
                return Err("unsupported");
            }
            let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONULL);
            let mut info = MONITORINFO {
                cbSize: size_of::<MONITORINFO>() as u32,
                ..Default::default()
            };
            if monitor.0.is_null() || !GetMonitorInfoW(monitor, &mut info).as_bool() {
                return Err("hidden");
            }
            // Shell_TrayWnd is expected on the primary display. Secondary bars
            // and custom shell topology are deliberately outside this v1.
            if info.dwFlags & 1 == 0 {
                return Err("unsupported");
            }
            let monitor = from_native(info.rcMonitor);
            if screen_rect.left < monitor.left
                || screen_rect.right > monitor.right
                || screen_rect.top < monitor.top.saturating_sub(rect.height())
                || screen_rect.bottom > monitor.bottom.saturating_add(rect.height())
            {
                return Err("hidden");
            }
            // This is a real child, not a top-level notification or overlay.
            // Explorer owns its fullscreen z-order, reveal and clipping. Querying
            // notification/foreground state here would independently SW_HIDE the
            // child on focus changes and make it miss the parent's next reveal.
            let dpi = GetDpiForWindow(hwnd);
            if !(72..=768).contains(&dpi) {
                return Err("hidden");
            }
            if f64::from(rect.height()) < 32.0 * f64::from(dpi) / 96.0 {
                return Err("hidden");
            }
            let mut pid = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == 0 {
                return Err("hidden");
            }
            let mut children: Vec<Child> = Vec::new();
            let _ = EnumChildWindows(
                Some(hwnd),
                Some(collect_child),
                LPARAM((&mut children as *mut Vec<Child>) as isize),
            );
            if children.len() >= 256 {
                return Err("error");
            }
            let (_, latest_screen_rect) = client_frame(hwnd).map_err(|_| "hidden")?;
            for child in &mut children {
                child.rect =
                    geometry::local_occupied(child.rect, screen_rect, latest_screen_rect, rect)
                        .ok_or("hidden")?;
                // Occupancy is horizontal. Ignore transient Y/inset differences
                // from Explorer's auto-hide animation in the layout fingerprint.
                child.rect.top = rect.top;
                child.rect.bottom = rect.bottom;
            }
            let screen_rect = latest_screen_rect;
            let revealed = parent_visible && monitor.contains(screen_rect);
            let app_host = children
                .iter()
                .filter(|child| geometry::is_app_host(&child.class))
                .map(|child| child.rect)
                .reduce(|a, b| Rect {
                    left: a.left.min(b.left),
                    top: a.top.min(b.top),
                    right: a.right.max(b.right),
                    bottom: a.bottom.max(b.bottom),
                })
                .ok_or("hidden")?;
            let tray = children
                .iter()
                .find(|child| child.class == "TrayNotifyWnd")
                .map(|child| child.rect)
                .ok_or("hidden")?;
            if !rect.contains(app_host) || tray.left < rect.left || tray.right > rect.right {
                return Err("hidden");
            }
            // Start/Widgets before the app host and the entire tray are always
            // protected. UIA supplies the app guard: real button bounds when
            // exposed, otherwise the complete (possibly stretched) app host.
            let mut occupied = vec![
                Rect {
                    right: app_host.left,
                    ..rect
                },
                Rect {
                    left: tray.left,
                    ..rect
                },
            ];
            occupied.extend(children.into_iter().filter_map(|child| {
                // Win11's composition/input HWND can cover the entire taskbar.
                // It paints the buttons but is not itself an occupied button.
                (!geometry::is_render_host(&child.class) && !geometry::is_app_host(&child.class))
                    .then_some(child.rect)
            }));
            occupied.sort_unstable_by_key(|rect| (rect.left, rect.right));
            occupied.dedup();
            Ok(Shell {
                hwnd: hwnd.0 as usize,
                pid,
                rect,
                screen_rect,
                revealed,
                monitor,
                dpi,
                app_host,
                occupied,
            })
        }
    }

    fn scan_controls(uia: &IUIAutomation, shell: &Shell) -> Result<Vec<Rect>, ()> {
        unsafe {
            // The request's revealed flag can already be stale when this MTA
            // starts reading. A scan spanning a hide/reveal is unavailable, not
            // proof that the app-host tail became occupied.
            validate_scan_frame(shell)?;
            let root = uia
                .ElementFromHandle(HWND(shell.hwnd as *mut _))
                .map_err(|_| ())?;
            if root.CurrentProcessId().map_err(|_| ())? != shell.pid as i32 {
                return Err(());
            }
            let condition = uia.CreateTrueCondition().map_err(|_| ())?;
            let elements = root
                .FindAll(TreeScope_Descendants, &condition)
                .map_err(|_| ())?;
            let count = elements.Length().map_err(|_| ())?;
            if count > 512 || count < 0 || (count == 0 && shell.revealed) {
                return Err(());
            }
            let mut occupied = Vec::new();
            let mut app_buttons = Vec::new();
            for index in 0..count {
                validate_scan_frame(shell)?;
                let element = elements.GetElement(index).map_err(|_| ())?;
                if is_our_uia_subtree(uia, &element, shell.pid)? {
                    continue;
                }
                if element.CurrentIsOffscreen().map_err(|_| ())?.as_bool() && shell.revealed {
                    continue;
                }
                let (_, origin_before) = client_frame(HWND(shell.hwnd as *mut _))?;
                let bounds = from_native(element.CurrentBoundingRectangle().map_err(|_| ())?);
                // Parent translation is not a layout change. Use its current
                // origin so an autohide slide does not invalidate the local gap.
                let (_, origin_after) = client_frame(HWND(shell.hwnd as *mut _))?;
                let rect =
                    geometry::local_occupied(bounds, origin_before, origin_after, shell.rect)
                        .ok_or(())?;
                if !rect.valid()
                    || rect.bottom <= shell.rect.top
                    || rect.top >= shell.rect.bottom
                    || rect.right <= shell.rect.left
                    || rect.left >= shell.rect.right
                {
                    continue;
                }
                let kind = element.CurrentControlType().map_err(|_| ())?;
                let class = element.CurrentClassName().map_err(|_| ())?.to_string();
                let id = element.CurrentAutomationId().map_err(|_| ())?.to_string();
                if geometry::is_render_host(&class)
                    || geometry::is_app_host(&class)
                    || id == "TaskbarFrame"
                    || (kind == UIA_PaneControlTypeId
                        && rect.left <= shell.rect.left
                        && rect.right >= shell.rect.right)
                {
                    continue;
                }
                // In Win10 ReBar/MSTaskList may stretch through the empty tail.
                // Only actual button descendants may replace that host's guard;
                // a nearby tray/Start control is not evidence about app buttons.
                if (kind == UIA_ButtonControlTypeId || kind == UIA_ListItemControlTypeId)
                    && shell.app_host.contains(rect)
                    && has_app_ancestor(uia, &element)?
                {
                    app_buttons.push(rect);
                }
                occupied.push(rect);
            }
            if occupied.is_empty() {
                if shell.revealed {
                    return Err(());
                }
                // Some Explorer providers expose no onscreen controls while
                // auto-hidden. A successful scan may still prepare the child
                // using conservative native guards and the COMPLETE app host.
                // API/provider errors continue to fail closed above.
                occupied.extend(shell.occupied.iter().copied());
            }
            occupied.push(geometry::app_guard(
                shell.rect,
                shell.app_host,
                &app_buttons,
            ));
            validate_scan_frame(shell)?;
            Ok(occupied)
        }
    }

    fn is_our_uia_subtree(
        uia: &IUIAutomation,
        element: &IUIAutomationElement,
        shell_pid: u32,
    ) -> Result<bool, ()> {
        unsafe {
            let pid = element.CurrentProcessId().map_err(|_| ())? as u32;
            if pid == std::process::id() {
                return Ok(true);
            }
            // Explorer's own controls cannot belong to our HWND. For foreign
            // providers (including WebView2), inspect ancestors before skipping.
            if pid == shell_pid {
                return Ok(false);
            }
            let walker = uia.RawViewWalker().map_err(|_| ())?;
            let mut current = element.clone();
            for _ in 0..24 {
                if current.CurrentProcessId().map_err(|_| ())? == std::process::id() as i32 {
                    return Ok(true);
                }
                let hwnd = current.CurrentNativeWindowHandle().map_err(|_| ())?;
                if !hwnd.0.is_null() && is_our_subtree(hwnd) {
                    return Ok(true);
                }
                if current.CurrentClassName().map_err(|_| ())?.to_string() == "Shell_TrayWnd" {
                    return Ok(false);
                }
                current = walker.GetParentElement(&current).map_err(|_| ())?;
            }
            Err(())
        }
    }

    fn has_app_ancestor(uia: &IUIAutomation, element: &IUIAutomationElement) -> Result<bool, ()> {
        unsafe {
            let walker = uia.RawViewWalker().map_err(|_| ())?;
            let mut current = element.clone();
            for _ in 0..16 {
                current = walker.GetParentElement(&current).map_err(|_| ())?;
                let class = current.CurrentClassName().map_err(|_| ())?.to_string();
                if geometry::is_app_host(&class) {
                    return Ok(true);
                }
                if class == "Shell_TrayWnd" {
                    return Ok(false);
                }
            }
            Ok(false)
        }
    }

    fn apply(app: &AppHandle, mut plan: Plan) {
        if !enabled(app) {
            plan = Plan::hidden("off");
        } else if plan.state == "off" {
            // A stale disabled tick must not undo a newer enable action.
            return;
        }
        if plan.retain {
            // Retaining performs NO show/hide/position write. The last confirmed
            // child remains attached through parent movement and UIA dropouts.
            let retained = plan
                .shell
                .as_ref()
                .zip(plan.rect)
                .is_some_and(|(shell, rect)| retain_attached(app, shell, rect));
            if retained {
                publish(app, plan.state);
                return;
            }
            plan = Plan::hidden("hidden");
        }
        if let (Some(expected), Some(rect), Some(requested)) =
            (&plan.shell, plan.rect, plan.requested)
        {
            // Recheck shell identity and native occupied bounds at the moment of
            // applying. Explorer may have changed since the worker's snapshot.
            let safe = placement_current(app, expected, rect, requested);
            if !safe {
                // A fresh watcher plan may age in the main-thread queue. That
                // forbids a new placement, not retention of the exact child that
                // was already safely attached. Do not independently hide it.
                if retain_attached(app, expected, rect) {
                    publish(app, plan.state);
                    return;
                }
                plan = Plan::hidden("hidden");
            }
        }
        if let (Some(rect), Some(shell), Some(requested)) = (plan.rect, &plan.shell, plan.requested)
        {
            let result = show(app, rect, shell, requested);
            if let Err(error) = result {
                if super::status().state != "error" {
                    log::warn!("Taskbar window unavailable: {error}");
                }
                if let Some(hwnd) = player_hwnd() {
                    let _ = hide_window(hwnd);
                }
                publish(app, "error");
            } else if matches!(result, Ok(true)) {
                publish(app, plan.state);
            } else {
                publish(app, if enabled(app) { "hidden" } else { "off" });
            }
        } else {
            if let Some(hwnd) = player_hwnd() {
                let result = if plan.state == "off" {
                    native_player::destroy(hwnd);
                    *attachment().lock() = None;
                    Ok(())
                } else {
                    hide_window(hwnd)
                };
                if result.is_err() {
                    publish(app, "error");
                    return;
                }
            }
            publish(app, plan.state);
        }
    }

    fn retain_attached(app: &AppHandle, expected: &Shell, rect: Rect) -> bool {
        let attached = *attachment().lock();
        let Some(hwnd) = player_hwnd() else {
            return false;
        };
        let parent = HWND(expected.hwnd as *mut _);
        let options = player_options(app);
        let logical_width = native_player::logical_width(options);
        may_retain_rejected_plan(enabled(app), attached, hwnd.0 as usize, expected, rect)
            && attached.is_some_and(|attached| attached.options == options)
            && unsafe {
                GetParent(hwnd).is_ok_and(|actual| actual == parent)
                    && GetDpiForWindow(hwnd) == expected.dpi
                    && GetWindowLongPtrW(hwnd, GWL_STYLE) & WS_VISIBLE.0 as isize != 0
            }
            && match discover_shell() {
                Ok(current) => {
                    current.same_layout(expected)
                        && geometry::still_clear_sized(
                            current.rect,
                            &current.occupied,
                            current.dpi,
                            rect,
                            logical_width,
                        )
                }
                Err(_) => hidden_parent_frame(expected).is_some(),
            }
    }

    /// A queued/rejected plan can retain only the exact previously applied child.
    /// Native parent, visibility and clearance checks still follow this predicate.
    /// In particular, expiry never authorizes creating or moving a window.
    fn may_retain_rejected_plan(
        is_enabled: bool,
        attached: Option<Attachment>,
        hwnd: usize,
        expected: &Shell,
        rect: Rect,
    ) -> bool {
        is_enabled
            && attached.is_some_and(|attached| {
                attached.hwnd == hwnd
                    && attached.parent == expected.hwnd
                    && attached.parent_pid == expected.pid
                    && attached.dpi == expected.dpi
                    && attached.rect == Some(rect)
            })
    }

    fn player_hwnd() -> Option<HWND> {
        let hwnd = HWND(attachment().lock().as_ref()?.hwnd as *mut _);
        let mut pid = 0;
        unsafe {
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            (IsWindow(Some(hwnd)).as_bool() && pid == std::process::id()).then_some(hwnd)
        }
    }

    fn player_options(app: &AppHandle) -> native_player::PlayerOptions {
        app.try_state::<crate::config::ConfigState>()
            .and_then(|state| state.load().ok())
            .map(|config| native_player::PlayerOptions {
                scale: config.taskbar.scale,
                layout: native_player::TaskbarLayout::from_config(
                    config
                        .plugins
                        .settings
                        .get("ui")
                        .and_then(|ui| ui.get("taskbarLayout")),
                    config.taskbar.show_like,
                ),
            })
            .unwrap_or_default()
    }

    fn refresh_native_player(app: &AppHandle) {
        let Some(hwnd) = player_hwnd() else { return };
        let locale = app
            .state::<crate::config::ConfigState>()
            .load()
            .map(|config| match config.appearance.locale {
                crate::config::Locale::En => "en",
                crate::config::Locale::Ru => "ru",
            })
            .unwrap_or("ru");
        let snapshot = crate::media::cached_snapshot().filter(|snapshot| match snapshot.provider {
            crate::media::MediaProvider::Smtc => {
                crate::media::current_health().status
                    != crate::media::health::SmtcHealth::Unavailable
            }
            crate::media::MediaProvider::YandexDirect => matches!(
                crate::yandex::status().state,
                crate::yandex::DirectYandexState::Connected
            ),
        });
        native_player::update(hwnd, snapshot, locale, player_options(app));
    }

    fn placement_current(
        app: &AppHandle,
        expected: &Shell,
        rect: Rect,
        requested: Instant,
    ) -> bool {
        let logical_width = native_player::logical_width(player_options(app));
        enabled(app)
            && requested.elapsed() <= SNAPSHOT_TTL
            && discover_shell().is_ok_and(|current| {
                current.same_shell(expected)
                    && geometry::still_clear_sized(
                        current.rect,
                        &current.occupied,
                        current.dpi,
                        rect,
                        logical_width,
                    )
            })
    }

    fn show(
        app: &AppHandle,
        rect: Rect,
        shell: &Shell,
        requested: Instant,
    ) -> anyhow::Result<bool> {
        let parent = HWND(shell.hwnd as *mut _);
        let options = player_options(app);
        let logical_width = native_player::logical_width(options);
        let expected_width = ((i64::from(logical_width) * i64::from(shell.dpi) + 48) / 96) as i32;
        anyhow::ensure!(
            rect.width() == expected_width,
            "Taskbar player options changed during placement"
        );
        unsafe {
            anyhow::ensure!(
                AreDpiAwarenessContextsEqual(
                    GetThreadDpiAwarenessContext(),
                    GetWindowDpiAwarenessContext(parent)
                )
                .as_bool(),
                "Taskbar and UI thread use incompatible DPI awareness"
            );
        }
        let current = *attachment().lock();
        let options_changed = current.is_some_and(|attached| attached.options != options);
        if let Some(attached) = current {
            if attached.parent != shell.hwnd
                || attached.parent_pid != shell.pid
                || attached.dpi != shell.dpi
            {
                if let Some(hwnd) = player_hwnd() {
                    native_player::destroy(hwnd);
                }
                *attachment().lock() = None;
            }
        }
        let existing = player_hwnd();
        let hwnd = match existing {
            Some(hwnd) => hwnd,
            None => {
                let hwnd = native_player::create(app, parent, shell.dpi, options)?;
                if let Err(error) = embed_child(hwnd, parent) {
                    native_player::destroy(hwnd);
                    return Err(error);
                }
                *attachment().lock() = Some(Attachment {
                    hwnd: hwnd.0 as usize,
                    parent: shell.hwnd,
                    parent_pid: shell.pid,
                    dpi: shell.dpi,
                    rect: None,
                    options,
                });
                refresh_native_player(app);
                hwnd
            }
        };
        if options_changed {
            refresh_native_player(app);
            if let Some(attached) = attachment().lock().as_mut() {
                attached.options = options;
            }
        }
        if !placement_current(app, shell, rect, requested) {
            if retain_attached(app, shell, rect) {
                return Ok(true);
            }
            if enabled(app) {
                hide_window(hwnd)?;
            } else {
                native_player::destroy(hwnd);
                *attachment().lock() = None;
            }
            return Ok(false);
        }
        let previous_rect = attachment().lock().and_then(|state| state.rect);
        position_child(hwnd, rect, previous_rect)?;
        if let Some(attached) = attachment().lock().as_mut() {
            attached.rect = Some(rect);
        }
        Ok(true)
    }

    fn position_child(hwnd: HWND, rect: Rect, previous: Option<Rect>) -> anyhow::Result<bool> {
        unsafe {
            // Comparing two screen-space reads during an Explorer slide creates
            // false changes. Our last applied CLIENT rectangle is authoritative.
            let visible = GetWindowLongPtrW(hwnd, GWL_STYLE) & WS_VISIBLE.0 as isize != 0;
            if previous == Some(rect) && visible {
                return Ok(false);
            }
            SetWindowPos(
                hwnd,
                Some(HWND_TOP),
                rect.left,
                rect.top,
                rect.width(),
                rect.height(),
                position_flags(visible, previous.is_none()),
            )?;
        }
        Ok(true)
    }

    fn position_flags(visible: bool, first_position: bool) -> SET_WINDOW_POS_FLAGS {
        SWP_NOACTIVATE
            | SWP_NOOWNERZORDER
            | if visible {
                SET_WINDOW_POS_FLAGS(0)
            } else {
                SWP_SHOWWINDOW
            }
            | if first_position {
                SWP_FRAMECHANGED
            } else {
                SWP_NOZORDER
            }
    }

    fn embed_child(hwnd: HWND, parent: HWND) -> anyhow::Result<()> {
        unsafe {
            // Do not let cross-process SetParent reset the DPI awareness of
            // Music Island's other windows. A mismatch fails closed.
            let child_context = GetWindowDpiAwarenessContext(hwnd);
            let parent_context = GetWindowDpiAwarenessContext(parent);
            anyhow::ensure!(
                !child_context.0.is_null()
                    && !parent_context.0.is_null()
                    && AreDpiAwarenessContextsEqual(child_context, parent_context).as_bool(),
                "Taskbar and player use incompatible DPI awareness"
            );
            anyhow::ensure!(
                SetWindowSubclass(hwnd, Some(child_window_proc), SUBCLASS_ID, 0).as_bool(),
                "Taskbar child hook was not installed"
            );
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
            SetWindowLongPtrW(
                hwnd,
                GWL_STYLE,
                (style & !(WS_POPUP.0 as isize)) | WS_CHILD.0 as isize,
            );
            let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(
                hwnd,
                GWL_EXSTYLE,
                (style | WS_EX_NOACTIVATE.0 as isize | WS_EX_TOOLWINDOW.0 as isize)
                    & !((WS_EX_APPWINDOW.0 | WS_EX_TOPMOST.0) as isize),
            );
            // A null previous parent is also a successful SetParent result;
            // verify the actual parent instead of treating that as failure.
            if !GetParent(hwnd).is_ok_and(|actual| actual == parent) {
                let _ = SetParent(hwnd, Some(parent));
            }
            anyhow::ensure!(
                GetParent(hwnd).is_ok_and(|actual| actual == parent),
                "Taskbar parent was not applied"
            );
            anyhow::ensure!(
                GetWindowLongPtrW(hwnd, GWL_STYLE) & WS_CHILD.0 as isize != 0,
                "Taskbar child style was not applied"
            );
        }
        Ok(())
    }

    const SUBCLASS_ID: usize = 0x4d49_5442;

    unsafe extern "system" fn child_window_proc(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        if message == WM_MOUSEACTIVATE {
            // Keep the click, without activating our child or its Explorer parent.
            return LRESULT(MA_NOACTIVATE as isize);
        }
        if message == WM_NCDESTROY {
            let _ = RemoveWindowSubclass(hwnd, Some(child_window_proc), SUBCLASS_ID);
            let mut state = attachment().lock();
            if state.is_some_and(|attached| attached.hwnd == hwnd.0 as usize) {
                *state = None;
            }
        }
        // Input, accessibility and drawing belong to the native host/buttons.
        DefSubclassProc(hwnd, message, wparam, lparam)
    }

    fn hide_window(hwnd: HWND) -> anyhow::Result<()> {
        unsafe {
            // A no-op while hidden must not change native activation or z-order.
            if GetWindowLongPtrW(hwnd, GWL_STYLE) & WS_VISIBLE.0 as isize != 0 {
                let _ = ShowWindow(hwnd, SW_HIDE);
            }
            anyhow::ensure!(
                GetWindowLongPtrW(hwnd, GWL_STYLE) & WS_VISIBLE.0 as isize == 0,
                "Taskbar window did not hide"
            );
        }
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn position_flags_show_only_a_hidden_child_and_preserve_existing_z_order() {
            let moving_visible = position_flags(true, false);
            assert_eq!(moving_visible & SWP_SHOWWINDOW, SET_WINDOW_POS_FLAGS(0));
            assert_eq!(moving_visible & SWP_NOZORDER, SWP_NOZORDER);

            let showing_new = position_flags(false, true);
            assert_eq!(showing_new & SWP_SHOWWINDOW, SWP_SHOWWINDOW);
            assert_eq!(showing_new & SWP_FRAMECHANGED, SWP_FRAMECHANGED);
        }

        pub(super) fn is_running_player(hwnd: HWND) -> bool {
            use windows::Win32::UI::WindowsAndMessaging::GetWindowTextW;
            let mut title = [0_u16; 128];
            let length = unsafe { GetWindowTextW(hwnd, &mut title) };
            String::from_utf16_lossy(&title[..length.max(0) as usize]) == "Music Island — taskbar"
                && unsafe { GetParent(hwnd) }
                    .is_ok_and(|parent| class_name(parent) == "Shell_TrayWnd")
        }

        unsafe extern "system" fn find_player(hwnd: HWND, data: LPARAM) -> BOOL {
            if is_running_player(hwnd) {
                (&mut *(data.0 as *mut Vec<HWND>)).push(hwnd);
            }
            BOOL(1)
        }

        fn fixture_shell() -> Shell {
            let rect = Rect {
                left: 0,
                top: 0,
                right: 1920,
                bottom: 48,
            };
            Shell {
                hwnd: 100,
                pid: 200,
                rect,
                screen_rect: Rect {
                    top: 1032,
                    bottom: 1080,
                    ..rect
                },
                revealed: true,
                monitor: Rect {
                    bottom: 1080,
                    ..rect
                },
                dpi: 96,
                app_host: Rect {
                    left: 60,
                    right: 1700,
                    ..rect
                },
                occupied: vec![Rect { right: 60, ..rect }, Rect { left: 1700, ..rect }],
            }
        }

        #[test]
        fn native_gap_reanchors_without_using_an_uninspected_app_host_tail() {
            let mut shell = fixture_shell();
            // Classic stretching: there is no confirmed native gap.
            assert!(plan_from_native(shell.clone(), None).is_none());
            // Real desktop geometry: a compact app host and a wide empty area.
            shell.app_host.right = 1000;
            let plan = plan_from_native(shell.clone(), None).unwrap();
            let rect = plan.rect.unwrap();
            assert!(rect.left > shell.app_host.right);
            assert!(rect.right < shell.occupied[1].left);
            assert!(plan.requested.unwrap().elapsed() < SNAPSHOT_TTL);
            // A native tray-boundary change is enough to update the anchor.
            shell.occupied[1].left -= 32;
            let next = plan_from_native(shell.clone(), Some(&plan)).unwrap();
            assert_eq!(next.rect.unwrap().right, shell.occupied[1].left - 16);
            assert_ne!(next.rect, Some(rect));
            // A layout that needs UIA must not silently place on top of apps.
            shell.app_host.right = 1700;
            assert!(plan_from_native(shell, None).is_none());
        }

        #[test]
        fn native_fast_path_preserves_a_previous_uia_verified_tail_for_the_scan_path() {
            let shell = fixture_shell();
            let scan = Scan {
                shell: shell.clone(),
                requested: Instant::now(),
                occupied: Ok(vec![Rect {
                    right: 1000,
                    ..shell.rect
                }]),
            };
            let plan = plan_from_scan(shell.clone(), Some(&scan), None);
            assert!(plan.rect.is_some());
            assert!(plan_from_native(shell, Some(&plan)).is_none());
        }

        #[test]
        fn native_tray_expansion_relocates_without_hiding_or_waiting_for_uia() {
            let mut shell = fixture_shell();
            shell.rect.right = 2560;
            shell.screen_rect.right = 2560;
            shell.monitor.right = 2560;
            shell.app_host = Rect {
                left: 839,
                right: 1721,
                ..shell.rect
            };
            shell.occupied = vec![
                Rect {
                    right: 839,
                    ..shell.rect
                },
                Rect {
                    left: 2251,
                    ..shell.rect
                },
            ];
            let mut previous = plan_from_native(shell.clone(), None).unwrap();
            assert_eq!(previous.rect.unwrap().right, 2235);
            for left in [2219, 2187] {
                shell.occupied[1].left = left;
                let next = plan_from_native(shell.clone(), Some(&previous)).unwrap();
                assert!(next.rect.is_some());
                assert_eq!(left - next.rect.unwrap().right, 16);
                assert_eq!(next.state, "visible");
                previous = next;
            }
        }

        #[test]
        fn native_tray_shrink_reanchors_to_its_right_boundary_without_hiding() {
            let mut shell = fixture_shell();
            shell.rect.right = 2560;
            shell.screen_rect.right = 2560;
            shell.monitor.right = 2560;
            shell.app_host = Rect {
                left: 839,
                right: 1721,
                ..shell.rect
            };
            shell.occupied = vec![
                Rect {
                    right: 839,
                    ..shell.rect
                },
                Rect {
                    left: 2187,
                    ..shell.rect
                },
            ];
            let previous = plan_from_native(shell.clone(), None).unwrap();
            assert_eq!(previous.rect.unwrap().right, 2171);

            shell.occupied[1].left = 2251;
            let reanchored = plan_from_native(shell, Some(&previous)).unwrap();
            assert_eq!(reanchored.rect.unwrap().right, 2235);
            assert_eq!(reanchored.state, "visible");
            assert!(!reanchored.retain);
        }

        #[test]
        fn verified_scan_reanchors_after_tray_shrink_without_a_hide_transition() {
            let mut shell = fixture_shell();
            shell.rect.right = 2560;
            shell.screen_rect.right = 2560;
            shell.monitor.right = 2560;
            shell.app_host = Rect {
                left: 839,
                right: 1721,
                ..shell.rect
            };
            shell.occupied = vec![
                Rect {
                    right: 839,
                    ..shell.rect
                },
                Rect {
                    left: 2187,
                    ..shell.rect
                },
            ];
            let first_scan = Scan {
                shell: shell.clone(),
                requested: Instant::now(),
                occupied: Ok(vec![Rect {
                    right: 1721,
                    ..shell.rect
                }]),
            };
            let previous = plan_from_scan(shell.clone(), Some(&first_scan), None);
            assert_eq!(previous.rect.unwrap().right, 2171);

            shell.occupied[1].left = 2251;
            let fresh_scan = Scan {
                shell: shell.clone(),
                requested: Instant::now(),
                occupied: Ok(vec![Rect {
                    right: 1721,
                    ..shell.rect
                }]),
            };
            let reanchored = plan_from_scan(shell, Some(&fresh_scan), Some(&previous));
            assert_eq!(reanchored.rect.unwrap().right, 2235);
            assert_eq!(reanchored.state, "visible");
            assert!(!reanchored.retain);
        }

        #[test]
        fn retains_confirmed_gap_through_missing_failed_and_expired_uia_snapshots() {
            let shell = fixture_shell();
            let valid = Scan {
                shell: shell.clone(),
                requested: Instant::now(),
                occupied: Ok(vec![Rect {
                    right: 1000,
                    ..shell.rect
                }]),
            };
            let confirmed = plan_from_scan(shell.clone(), Some(&valid), None);
            assert!(confirmed.rect.is_some());
            assert!(!confirmed.retain);
            assert!(plan_from_scan(shell.clone(), None, None).rect.is_none());
            let missing = plan_from_scan(shell.clone(), None, Some(&confirmed));
            assert!(missing.retain);
            assert_eq!(missing.rect, confirmed.rect);
            let failed = Scan {
                occupied: Err(()),
                ..valid
            };
            assert!(plan_from_scan(shell.clone(), Some(&failed), Some(&confirmed)).retain);
            let expired = Scan {
                requested: Instant::now() - Duration::from_secs(3600),
                ..failed
            };
            assert!(plan_from_scan(shell, Some(&expired), Some(&confirmed)).retain);
        }

        #[test]
        fn rejected_queued_plan_retains_only_the_same_enabled_applied_child() {
            // This gate is shared by the apply-time and post-WebView validation
            // fallbacks, after a queued request has expired or been rejected.
            let shell = fixture_shell();
            let rect = Rect {
                left: 1548,
                top: 4,
                right: 1692,
                bottom: 44,
            };
            let attached = Attachment {
                hwnd: 300,
                parent: shell.hwnd,
                parent_pid: shell.pid,
                dpi: shell.dpi,
                rect: Some(rect),
                options: native_player::PlayerOptions::default(),
            };
            assert!(may_retain_rejected_plan(
                true,
                Some(attached),
                300,
                &shell,
                rect
            ));
            // A new WebView has no confirmed attachment or applied rectangle.
            assert!(!may_retain_rejected_plan(true, None, 300, &shell, rect));
            assert!(!may_retain_rejected_plan(
                true,
                Some(Attachment {
                    rect: None,
                    ..attached
                }),
                300,
                &shell,
                rect
            ));
            // A reused label/new HWND and a relocation selected after a collision
            // must both wait for fresh placement validation.
            assert!(!may_retain_rejected_plan(
                true,
                Some(attached),
                301,
                &shell,
                rect
            ));
            let moved = Rect {
                left: 1300,
                right: 1444,
                ..rect
            };
            assert!(!may_retain_rejected_plan(
                true,
                Some(attached),
                300,
                &shell,
                moved
            ));
            assert!(!may_retain_rejected_plan(
                false,
                Some(attached),
                300,
                &shell,
                rect
            ));
            for changed in [
                Shell {
                    hwnd: 101,
                    ..shell.clone()
                },
                Shell {
                    pid: 201,
                    ..shell.clone()
                },
                Shell {
                    dpi: 144,
                    ..shell.clone()
                },
            ] {
                assert!(!may_retain_rejected_plan(
                    true,
                    Some(attached),
                    300,
                    &changed,
                    rect
                ));
            }
        }

        #[test]
        fn scan_cannot_keep_request_visibility_after_parent_started_hiding() {
            let shell = fixture_shell();
            assert!(scan_frame_matches(
                &shell,
                shell.rect,
                shell.screen_rect,
                true
            ));
            let moving = Rect {
                top: shell.screen_rect.top + 1,
                bottom: shell.screen_rect.bottom + 1,
                ..shell.screen_rect
            };
            assert!(!scan_frame_matches(&shell, shell.rect, moving, true));
            assert!(!scan_frame_matches(
                &shell,
                shell.rect,
                shell.screen_rect,
                false
            ));
            let hidden = Shell {
                revealed: false,
                screen_rect: moving,
                ..shell.clone()
            };
            assert!(!scan_frame_matches(
                &hidden,
                shell.rect,
                shell.screen_rect,
                true
            ));
        }

        #[test]
        fn hidden_provider_cannot_replace_confirmed_gap_with_stretched_host_fallback() {
            let mut shell = fixture_shell();
            let valid = Scan {
                shell: shell.clone(),
                requested: Instant::now(),
                occupied: Ok(vec![Rect {
                    right: 1000,
                    ..shell.rect
                }]),
            };
            let confirmed = plan_from_scan(shell.clone(), Some(&valid), None);
            shell.revealed = false;
            let hidden = Scan {
                shell: shell.clone(),
                requested: Instant::now(),
                occupied: Ok(vec![geometry::app_guard(shell.rect, shell.app_host, &[])]),
            };
            assert_eq!(
                plan_from_scan(shell.clone(), Some(&hidden), None).state,
                "no-space"
            );
            let retained = plan_from_scan(shell.clone(), Some(&hidden), Some(&confirmed));
            assert_eq!(retained.rect, confirmed.rect);
            assert!(retained.retain);
            // The first reveal must not consume the preceding hidden scan either.
            shell.revealed = true;
            assert!(plan_from_scan(shell, Some(&hidden), Some(&retained)).retain);
        }

        #[test]
        fn retains_near_tray_child_across_tray_growth_outside_its_gap() {
            let mut shell = fixture_shell();
            shell.rect.right = 2560;
            shell.screen_rect.right = 2560;
            shell.monitor.right = 2560;
            shell.app_host = Rect {
                left: 839,
                right: 1721,
                ..shell.rect
            };
            shell.occupied = vec![
                Rect {
                    right: 839,
                    ..shell.rect
                },
                Rect {
                    left: 2251,
                    ..shell.rect
                },
            ];
            let scan = Scan {
                shell: shell.clone(),
                requested: Instant::now(),
                occupied: Ok(vec![Rect {
                    right: 1721,
                    ..shell.rect
                }]),
            };
            let mut confirmed = plan_from_scan(shell.clone(), Some(&scan), None);
            // A previously placed clear rectangle remains stable even when the
            // preferred first-placement anchor changes in a later version.
            confirmed.rect = confirmed.rect.map(|rect| Rect {
                left: 2035,
                right: 2179,
                ..rect
            });
            let mut previous = confirmed.clone();
            for left in [2219, 2187, 2251] {
                shell.occupied[1].left = left;
                let next = plan_from_scan(shell.clone(), None, Some(&previous));
                assert!(
                    next.retain,
                    "A clear existing child requires no show/hide operation"
                );
                assert_eq!(next.rect, confirmed.rect, "No native move is necessary");
                previous = next;
            }
            shell.occupied[1].left = 2000;
            assert!(plan_from_scan(shell, None, Some(&previous)).rect.is_none());
        }

        #[test]
        fn confirmed_collision_or_native_layout_change_invalidates_retention() {
            let shell = fixture_shell();
            let valid = Scan {
                shell: shell.clone(),
                requested: Instant::now(),
                occupied: Ok(vec![Rect {
                    right: 1000,
                    ..shell.rect
                }]),
            };
            let confirmed = plan_from_scan(shell.clone(), Some(&valid), None);
            let blocked = Scan {
                occupied: Ok(vec![Rect {
                    right: 1700,
                    ..shell.rect
                }]),
                ..valid
            };
            let result = plan_from_scan(shell.clone(), Some(&blocked), Some(&confirmed));
            assert_eq!(result.state, "no-space");
            assert!(result.rect.is_none());
            for changed in [
                Shell {
                    pid: shell.pid + 1,
                    ..shell.clone()
                },
                Shell {
                    dpi: 144,
                    ..shell.clone()
                },
                Shell {
                    app_host: Rect {
                        right: 1800,
                        ..shell.app_host
                    },
                    ..shell.clone()
                },
            ] {
                assert!(plan_from_scan(changed, None, Some(&confirmed))
                    .rect
                    .is_none());
            }
        }

        #[test]
        fn fresh_scan_uses_current_safe_geometry_instead_of_a_stale_clear_rect() {
            let shell = fixture_shell();
            let initial = Scan {
                shell: shell.clone(),
                requested: Instant::now(),
                occupied: Ok(vec![
                    Rect {
                        right: 1000,
                        ..shell.rect
                    },
                    Rect {
                        left: 1450,
                        right: 1600,
                        ..shell.rect
                    },
                ]),
            };
            let confirmed = plan_from_scan(shell.clone(), Some(&initial), None);
            let fresh = Scan {
                occupied: Ok(vec![Rect {
                    right: 1000,
                    ..shell.rect
                }]),
                ..initial
            };
            let preferred = plan_from_scan(shell.clone(), Some(&fresh), None);
            assert_ne!(preferred.rect, confirmed.rect);
            let stable = plan_from_scan(shell, Some(&fresh), Some(&confirmed));
            assert_eq!(stable.rect, preferred.rect);
            assert!(!stable.retain);
        }

        #[test]
        fn characterizes_snapshot_invalidation_on_shell_replacement_and_button_growth() {
            let rect = Rect {
                left: 0,
                top: 1032,
                right: 1920,
                bottom: 1080,
            };
            let shell = Shell {
                hwnd: 100,
                pid: 200,
                rect,
                screen_rect: rect,
                revealed: true,
                monitor: Rect { top: 0, ..rect },
                dpi: 96,
                app_host: Rect {
                    left: 60,
                    right: 900,
                    ..rect
                },
                occupied: vec![Rect { left: 1700, ..rect }],
            };
            assert!(shell.same_shell(&shell));
            let mut changed = shell.clone();
            changed.pid += 1;
            assert!(!shell.same_shell(&changed));
            changed = shell.clone();
            changed.hwnd += 1;
            assert!(!shell.same_shell(&changed));
            changed = shell.clone();
            changed.app_host.right += 44;
            assert!(!shell.same_shell(&changed));
            changed = shell.clone();
            changed.dpi = 144;
            assert!(!shell.same_shell(&changed));
            // Autohide moves the same parent; its local layout remains valid.
            changed = shell.clone();
            changed.screen_rect.top += 46;
            changed.screen_rect.bottom += 46;
            changed.revealed = false;
            assert!(shell.same_shell(&changed));
        }

        #[test]
        fn child_mouse_activation_keeps_the_click_without_activating_explorer() {
            assert_eq!(
                unsafe {
                    child_window_proc(
                        HWND::default(),
                        WM_MOUSEACTIVATE,
                        WPARAM(0),
                        LPARAM(0),
                        0,
                        0,
                    )
                },
                LRESULT(MA_NOACTIVATE as isize)
            );
        }

        #[test]
        fn native_child_inherits_parent_motion_and_hidden_visibility() {
            use windows::Win32::UI::WindowsAndMessaging::{
                CreateWindowExW, DestroyWindow, SendMessageW,
            };
            struct TestWindow(HWND);
            impl Drop for TestWindow {
                fn drop(&mut self) {
                    unsafe {
                        let _ = DestroyWindow(self.0);
                    }
                }
            }
            unsafe {
                // Both windows stay offscreen; the parent is never shown.
                // This exercises our real Win32 adapter without touching Explorer.
                let create = || {
                    TestWindow(
                        CreateWindowExW(
                            WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW,
                            w!("STATIC"),
                            w!("Music Island embedding test"),
                            WS_POPUP,
                            -10000,
                            -10000,
                            1000,
                            48,
                            None,
                            None,
                            None,
                            None,
                        )
                        .unwrap(),
                    )
                };
                let parent = create();
                let child = create();
                embed_child(child.0, parent.0).unwrap();
                let local = Rect {
                    left: 120,
                    top: 4,
                    right: 264,
                    bottom: 44,
                };
                assert!(position_child(child.0, local, None).unwrap());
                assert_eq!(GetParent(child.0).unwrap(), parent.0);
                assert_ne!(
                    GetWindowLongPtrW(child.0, GWL_STYLE) & WS_CHILD.0 as isize,
                    0
                );
                assert_eq!(
                    GetWindowLongPtrW(child.0, GWL_STYLE) & WS_POPUP.0 as isize,
                    0
                );
                assert_eq!(
                    GetWindowLongPtrW(child.0, GWL_EXSTYLE) & WS_EX_TOPMOST.0 as isize,
                    0
                );
                assert_ne!(
                    GetWindowLongPtrW(child.0, GWL_STYLE) & WS_VISIBLE.0 as isize,
                    0
                );
                assert!(!IsWindowVisible(child.0).as_bool());
                let before = native_rect(child.0).unwrap();
                SetWindowPos(
                    parent.0,
                    None,
                    -9800,
                    -9954,
                    1000,
                    48,
                    SWP_NOACTIVATE | SWP_NOZORDER,
                )
                .unwrap();
                let after = native_rect(child.0).unwrap();
                assert_eq!(after.left - before.left, 200);
                assert_eq!(after.top - before.top, 46);
                assert_eq!(after.width(), 144);
                assert!(!IsWindowVisible(child.0).as_bool());
                // A watcher tick after the parent moves must issue no native
                // position/show operation and must preserve the child's own bit.
                assert!(!position_child(child.0, local, Some(local)).unwrap());
                assert_ne!(
                    GetWindowLongPtrW(child.0, GWL_STYLE) & WS_VISIBLE.0 as isize,
                    0
                );
                assert_eq!(
                    SendMessageW(child.0, WM_MOUSEACTIVATE, Some(WPARAM(0)), Some(LPARAM(0))),
                    LRESULT(MA_NOACTIVATE as isize)
                );
            }
        }

        #[test]
        #[ignore = "Read-only probe of the interactive Windows desktop; run explicitly with --ignored --nocapture"]
        fn probe_current_taskbar() {
            let (send, receive) = mpsc::sync_channel(1);
            std::thread::spawn(move || {
                let result = (|| -> Result<(Shell, Vec<Rect>, Rect), String> {
                    let shell = discover_shell().map_err(str::to_owned)?;
                    unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
                        .ok()
                        .map_err(|error| error.to_string())?;
                    let result = (|| {
                        let uia: IUIAutomation =
                            unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) }
                                .map_err(|error| error.to_string())?;
                        let uia_bounds = scan_controls(&uia, &shell)
                            .map_err(|_| "UIA snapshot unavailable".to_owned())?;
                        let mut occupied = shell.occupied.clone();
                        occupied.extend(uia_bounds.iter().copied());
                        let rect =
                            geometry::place(shell.rect, &occupied, shell.dpi).ok_or("no-space")?;
                        if !geometry::still_clear(shell.rect, &occupied, shell.dpi, rect) {
                            return Err("Overlapping placement".to_owned());
                        }
                        Ok((shell, uia_bounds, rect))
                    })();
                    unsafe {
                        CoUninitialize();
                    }
                    result
                })();
                let _ = send.send(result);
            });
            let result = receive
                .recv_timeout(Duration::from_secs(8))
                .expect("Taskbar/UIA probe timed out")
                .expect("Taskbar/UIA probe failed");
            println!(
                "Taskbar screen {:?}, client {:?}, revealed {}, DPI {}, native occupied {:?}, UIA occupied {:?}, safe child client {:?}",
                result.0.screen_rect, result.0.rect, result.0.revealed, result.0.dpi, result.0.occupied, result.1, result.2
            );
        }

        #[test]
        #[ignore = "Read-only probe; requires the running Music Island taskbar player to be enabled"]
        fn probe_running_taskbar_child() {
            unsafe {
                let parent = FindWindowW(w!("Shell_TrayWnd"), None).expect("Taskbar unavailable");
                let mut children = Vec::<HWND>::new();
                let _ = EnumChildWindows(
                    Some(parent),
                    Some(find_player),
                    LPARAM((&mut children as *mut Vec<HWND>) as isize),
                );
                assert_eq!(
                    children.len(),
                    1,
                    "Expected exactly one embedded Music Island child"
                );
                let child = children[0];
                assert_eq!(GetParent(child).unwrap(), parent);
                let style = GetWindowLongPtrW(child, GWL_STYLE);
                let extended = GetWindowLongPtrW(child, GWL_EXSTYLE);
                assert_ne!(style & WS_CHILD.0 as isize, 0);
                assert_eq!(style & WS_POPUP.0 as isize, 0);
                assert_eq!(extended & WS_EX_TOPMOST.0 as isize, 0);
                assert_ne!(extended & WS_EX_NOACTIVATE.0 as isize, 0);
                let (client, origin) = client_frame(parent).unwrap();
                let bounds = native_rect(child).unwrap().relative_to(origin);
                let dpi = GetDpiForWindow(parent);
                assert!(client.contains(bounds));
                assert_eq!(
                    bounds.width(),
                    (geometry::PLAYER_WIDTH * f64::from(dpi) / 96.0).round() as i32
                );
                assert_eq!(GetDpiForWindow(child), dpi);
                println!("Embedded child parent {:?}, client bounds {:?}, DPI {}, own WS_VISIBLE {}, effective visible {}",
                    parent, bounds, dpi, style & WS_VISIBLE.0 as isize != 0, IsWindowVisible(child).as_bool());
            }
        }

        #[test]
        #[ignore = "Read-only 10-second diagnostic of the running player and real taskbar; use --nocapture"]
        fn probe_taskbar_timeline() {
            use windows::Win32::UI::{
                Shell::SHQueryUserNotificationState, WindowsAndMessaging::GetForegroundWindow,
            };
            let snapshot = Arc::new(Mutex::new(None::<Scan>));
            let output = snapshot.clone();
            let (send, receive) = mpsc::sync_channel::<ScanRequest>(1);
            std::thread::spawn(move || unsafe {
                if CoInitializeEx(None, COINIT_MULTITHREADED).is_err() {
                    return;
                }
                if let Ok(uia) =
                    CoCreateInstance::<_, IUIAutomation>(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
                {
                    while let Ok(request) = receive.recv() {
                        let occupied = scan_controls(&uia, &request.shell);
                        *output.lock() = Some(Scan {
                            shell: request.shell,
                            requested: request.requested,
                            occupied,
                        });
                    }
                }
                CoUninitialize();
            });
            let mut verified = None::<Plan>;
            let mut saw_player = false;
            for tick in 0..20 {
                let shell = discover_shell();
                let mut observed = Vec::new();
                if let Ok(parent) = unsafe { FindWindowW(w!("Shell_TrayWnd"), None) } {
                    let mut children = Vec::<HWND>::new();
                    unsafe {
                        let _ = EnumChildWindows(
                            Some(parent),
                            Some(find_player),
                            LPARAM((&mut children as *mut Vec<HWND>) as isize),
                        );
                    }
                    for child in children {
                        saw_player = true;
                        let style = unsafe { GetWindowLongPtrW(child, GWL_STYLE) };
                        observed.push((
                            child.0 as usize,
                            style & WS_VISIBLE.0 as isize != 0,
                            unsafe { IsWindowVisible(child).as_bool() },
                            native_rect(child),
                        ));
                    }
                }
                let notification = unsafe { SHQueryUserNotificationState() }.map(|state| state.0);
                let foreground = class_name(unsafe { GetForegroundWindow() });
                match shell {
                    Ok(shell) => {
                        let _ = send.try_send(ScanRequest { shell: shell.clone(), requested: Instant::now() });
                        let latest = snapshot.lock();
                        let uia = latest.as_ref().map(|scan| (
                            scan.requested.elapsed().as_millis(),
                            scan.occupied.as_ref().map(|rects| rects.len()),
                        ));
                        let plan = plan_from_scan(shell.clone(), latest.as_ref(), verified.as_ref());
                        println!("tick {tick}: parent {} screen {:?} revealed {} dpi {} native {:?}; UIA {:?}; plan {} retain {} local {:?}; child {:?}; notification {:?} foreground {}",
                            shell.hwnd, shell.screen_rect, shell.revealed, shell.dpi, shell.occupied,
                            uia, plan.state, plan.retain, plan.rect, observed, notification, foreground);
                        if plan.rect.is_some() { verified = Some(plan); }
                    }
                    Err(reason) => println!("tick {tick}: discovery {reason}; child {:?}; notification {:?} foreground {}",
                        observed, notification, foreground),
                }
                std::thread::sleep(TICK);
            }
            assert!(saw_player, "No running embedded player was visible to this desktop/session; placement-only observations do not confirm runtime behavior");
        }
    }
}
