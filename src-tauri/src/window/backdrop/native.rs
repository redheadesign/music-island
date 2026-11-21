use super::{compositor::HostBackdrop, BackdropFrame, BackdropRegion};
use std::{cell::RefCell, collections::HashMap};
use tauri::{AppHandle, Emitter};
use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM},
    Graphics::Dwm::DwmIsCompositionEnabled,
    UI::{
        Accessibility::{HCF_HIGHCONTRASTON, HIGHCONTRASTW},
        Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
        WindowsAndMessaging::{
            GetClientRect, IsIconic, IsWindowVisible, SystemParametersInfoW, SPI_GETHIGHCONTRAST,
            SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS, WM_DPICHANGED, WM_DWMCOMPOSITIONCHANGED,
            WM_NCDESTROY, WM_SETTINGCHANGE, WM_SHOWWINDOW, WM_SIZE,
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
}
struct WindowEvents {
    app: AppHandle,
    label: String,
}
thread_local! { static WINDOWS: RefCell<HashMap<usize, State>> = RefCell::new(HashMap::new()); }

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
) -> Result<bool, String> {
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
            }
        });
        if frame.generation <= state.generation {
            return Ok(state.compositor.is_some() && state.frame.is_some());
        }
        state.generation = frame.generation;
        let mut bounds = RECT::default();
        let size_matches = unsafe { GetClientRect(hwnd, &mut bounds) }.is_ok()
            && frame.matches_pixels(bounds.right, bounds.bottom);
        if !frame.enabled
            || frame.regions.is_empty()
            || !size_matches
            || !*state.policy.get_or_insert_with(allowed_by_windows)
            || !unsafe { IsWindowVisible(hwnd) }.as_bool()
            || unsafe { IsIconic(hwnd) }.as_bool()
        {
            state.frame = None;
            if let Some(compositor) = &state.compositor {
                compositor.clear();
            }
            return Ok(false);
        }
        if state.unsupported {
            return Ok(false);
        }
        if state.compositor.is_none() {
            match HostBackdrop::new(hwnd) {
                Ok(compositor) => state.compositor = Some(compositor),
                Err(error) => {
                    state.unsupported = true;
                    crate::logging::append_event(&format!(
                        "desktop backdrop unavailable for {label}: {error}"
                    ));
                    return Ok(false);
                }
            }
        }
        let regions: Vec<_> = frame
            .regions
            .iter()
            .map(|region| region.physical(frame.scale))
            .collect();
        let geometry = (
            frame.viewport_width * frame.scale,
            frame.viewport_height * frame.scale,
            regions,
        );
        if state.frame.as_ref() != Some(&geometry) {
            let compositor = state.compositor.as_ref().expect("initialized compositor");
            if compositor
                .update(geometry.0 as f32, geometry.1 as f32, &geometry.2)
                .is_err()
            {
                compositor.clear();
                state.frame = None;
                return Ok(false);
            }
            state.frame = Some(geometry);
        }
        Ok(true)
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
    if matches!(
        message,
        WM_SHOWWINDOW | WM_SIZE | WM_DPICHANGED | WM_SETTINGCHANGE | WM_DWMCOMPOSITIONCHANGED
    ) {
        WINDOWS.with(|windows| {
            if let Ok(mut windows) = windows.try_borrow_mut() {
                if let Some(state) = windows.get_mut(&(hwnd.0 as usize)) {
                    state.frame = None;
                    if let Some(compositor) = &state.compositor {
                        compositor.clear();
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
