use super::{
    compositor::{HostBackdrop, LensLayout, LENS_FRAME, LENS_PRESENT_TIMER, LENS_RETRY},
    BackdropFrame, BackdropRegion,
};
use std::{cell::RefCell, collections::HashMap};
use tauri::{AppHandle, Emitter};
use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM},
    Graphics::Dwm::DwmIsCompositionEnabled,
    UI::{
        Accessibility::{HCF_HIGHCONTRASTON, HIGHCONTRASTW},
        Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
        WindowsAndMessaging::{
            GetClientRect, IsIconic, IsWindowVisible, KillTimer, SetTimer, SystemParametersInfoW,
            SPI_GETHIGHCONTRAST, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS, WM_DPICHANGED,
            WM_DWMCOMPOSITIONCHANGED, WM_NCDESTROY, WM_SETTINGCHANGE, WM_SHOWWINDOW, WM_SIZE,
            WM_TIMER,
        },
    },
};

const SUBCLASS_ID: usize = 0x4d49_4244;
struct State {
    generation: u64,
    compositor: Option<HostBackdrop>,
    unsupported: bool,
    policy: Option<bool>,
    frame: Option<(f64, f64, Vec<BackdropRegion>)>,
    lens: Option<(usize, LensLayout)>,
}
struct WindowEvents {
    app: AppHandle,
    label: String,
}
thread_local! { static WINDOWS: RefCell<HashMap<usize, State>> = RefCell::new(HashMap::new()); }

pub(super) fn request_borderless() -> windows::core::Result<bool> {
    use windows::{
        Graphics::Capture::{GraphicsCaptureAccess, GraphicsCaptureAccessKind},
        Security::Authorization::AppCapabilityAccess::AppCapabilityAccessStatus,
        Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
    };
    // This command is invoked by the settings button. Windows presents and
    // enforces its own consent. Never wait on the overlay's UI thread.
    unsafe { RoInitialize(RO_INIT_MULTITHREADED)? };
    let response = GraphicsCaptureAccess::RequestAccessAsync(GraphicsCaptureAccessKind::Borderless)
        .and_then(|operation| operation.join());
    unsafe { RoUninitialize() };
    Ok(response? == AppCapabilityAccessStatus::Allowed)
}

fn allowed_by_windows() -> bool {
    if !unsafe { DwmIsCompositionEnabled() }.is_ok_and(|value| value.as_bool()) {
        return false;
    }
    let mut contrast = HIGHCONTRASTW {
        cbSize: std::mem::size_of::<HIGHCONTRASTW>() as u32,
        ..Default::default()
    };
    if unsafe {
        SystemParametersInfoW(
            SPI_GETHIGHCONTRAST,
            contrast.cbSize,
            Some(&mut contrast as *mut _ as _),
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
        )
    }
    .is_err()
        || contrast.dwFlags.contains(HCF_HIGHCONTRASTON)
    {
        return false;
    }
    use winreg::{
        enums::{HKEY_CURRENT_USER, KEY_READ},
        RegKey,
    };
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(
            r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
            KEY_READ,
        )
        .and_then(|key| key.get_value::<u32, _>("EnableTransparency"))
        .unwrap_or(1)
        != 0
}

pub(super) fn apply(
    hwnd: HWND,
    app: &AppHandle,
    label: &str,
    frame: BackdropFrame,
) -> Result<Option<bool>, String> {
    WINDOWS.with(|windows| {
        let mut windows = windows.borrow_mut();
        let state = windows.entry(hwnd.0 as usize).or_insert_with(|| {
            let events = Box::new(WindowEvents {
                app: app.clone(),
                label: label.to_owned(),
            });
            let pointer = Box::into_raw(events);
            let listening = unsafe {
                SetWindowSubclass(hwnd, Some(window_proc), SUBCLASS_ID, pointer as usize)
            }
            .as_bool();
            if !listening {
                unsafe {
                    drop(Box::from_raw(pointer));
                }
            }
            State {
                generation: 0,
                compositor: None,
                unsupported: !listening,
                policy: None,
                frame: None,
                lens: None,
            }
        });
        if frame.generation <= state.generation {
            return Ok(None);
        }
        state.generation = frame.generation;
        if !frame.enabled || !*state.policy.get_or_insert_with(allowed_by_windows) {
            state.frame = None;
            state.lens = None;
            if let Some(compositor) = &mut state.compositor {
                compositor.clear();
            }
            return Ok(if frame.enabled { Some(false) } else { None });
        }
        if state.unsupported {
            return Ok(Some(false));
        }
        // Prepare the empty target while the top-edge window is still
        // collapsed, so attaching its first visible region needs no new target.
        if state.compositor.is_none() {
            match HostBackdrop::new(hwnd) {
                Ok(compositor) => state.compositor = Some(compositor),
                Err(error) => {
                    state.unsupported = true;
                    crate::logging::append_event(&format!(
                        "desktop backdrop unavailable for {label}: {error}"
                    ));
                    return Ok(Some(false));
                }
            }
        }
        let compositor = state.compositor.as_mut().expect("initialized compositor");
        if label == "main" && frame.prewarm_lens {
            compositor.prewarm_lens();
        }
        let mut bounds = RECT::default();
        let shown =
            unsafe { IsWindowVisible(hwnd) }.as_bool() && !unsafe { IsIconic(hwnd) }.as_bool();
        if frame.regions.is_empty() || !shown {
            state.frame = None;
            state.lens = None;
            compositor.clear();
            // A missing surface or a show/resize race is not a policy denial.
            return Ok(if frame.regions.is_empty() {
                Some(true)
            } else {
                None
            });
        }
        if unsafe { GetClientRect(hwnd, &mut bounds) }.is_err()
            || !frame.matches_pixels(bounds.right, bounds.bottom)
        {
            compositor.hide_visuals();
            state.frame = None;
            return Ok(None);
        }
        let regions: Vec<_> = frame
            .regions
            .iter()
            .map(|region| region.physical(frame.scale, frame.frost))
            .collect();
        let geometry = (
            frame.viewport_width * frame.scale,
            frame.viewport_height * frame.scale,
            regions,
        );
        let lens = (label == "main")
            .then_some(frame.lens)
            .flatten()
            .map(|settings| {
                (
                    settings.region,
                    LensLayout::new(
                        &frame.regions[settings.region],
                        frame.scale,
                        frame.frost,
                        settings,
                    ),
                )
            });
        let geometry_changed = state.frame.as_ref() != Some(&geometry);
        if geometry_changed {
            if compositor
                .update(geometry.0 as f32, geometry.1 as f32, &geometry.2)
                .is_err()
            {
                compositor.clear();
                state.frame = None;
                return Ok(Some(false));
            }
            state.frame = Some(geometry);
        }
        if geometry_changed || lens != state.lens {
            compositor.configure_lens(lens);
            state.lens = lens;
        }
        Ok(Some(true))
    })
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    message: u32,
    wp: WPARAM,
    lp: LPARAM,
    _: usize,
    data: usize,
) -> LRESULT {
    if message == LENS_RETRY && SetTimer(Some(hwnd), LENS_PRESENT_TIMER, 16, None) != 0 {
        return LRESULT(0);
    }
    let retry_present =
        message == LENS_RETRY || (message == WM_TIMER && wp.0 == LENS_PRESENT_TIMER);
    if message == LENS_FRAME || retry_present {
        if retry_present {
            let _ = KillTimer(Some(hwnd), LENS_PRESENT_TIMER);
        }
        WINDOWS.with(|windows| {
            if let Ok(mut windows) = windows.try_borrow_mut() {
                if let Some(compositor) = windows
                    .get_mut(&(hwnd.0 as usize))
                    .and_then(|state| state.compositor.as_mut())
                {
                    if retry_present {
                        compositor.retry_lens();
                    } else {
                        compositor.draw_lens();
                    }
                }
            }
        });
        return LRESULT(0);
    }
    if matches!(
        message,
        WM_SHOWWINDOW | WM_SIZE | WM_DPICHANGED | WM_SETTINGCHANGE | WM_DWMCOMPOSITIONCHANGED
    ) {
        WINDOWS.with(|windows| {
            if let Ok(mut windows) = windows.try_borrow_mut() {
                if let Some(state) = windows.get_mut(&(hwnd.0 as usize)) {
                    state.frame = None;
                    state.lens = None;
                    if let Some(compositor) = &mut state.compositor {
                        if message == WM_SIZE && !IsIconic(hwnd).as_bool() {
                            compositor.hide_visuals();
                        } else {
                            compositor.clear();
                        }
                    }
                    if matches!(message, WM_SETTINGCHANGE | WM_DWMCOMPOSITIONCHANGED) {
                        state.compositor = None;
                        state.unsupported = false;
                        state.policy = None;
                    }
                }
            }
        });
        let events = &*(data as *const WindowEvents);
        let _ = events
            .app
            .emit_to(&events.label, "overlay:backdrop-invalidated", ());
    }
    if message == WM_NCDESTROY {
        let _ = RemoveWindowSubclass(hwnd, Some(window_proc), SUBCLASS_ID);
        WINDOWS.with(|windows| {
            if let Ok(mut windows) = windows.try_borrow_mut() {
                windows.remove(&(hwnd.0 as usize));
            }
        });
        drop(Box::from_raw(data as *mut WindowEvents));
    }
    DefSubclassProc(hwnd, message, wp, lp)
}
