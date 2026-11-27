//! Keep the main overlay on one composition path while changing mouse input.
//! Tao's ignore-cursor API adds/removes both TRANSPARENT and LAYERED. Rebuilding
//! a monitor-sized transparent surface at the first hover can expose a blank
//! frame. Initialize Tao's layered state once while hidden, then change only
//! TRANSPARENT here. Initialize a uniform parent opacity too: an uninitialized
//! layered redirection bitmap can pass input through parts of the GPU WebView.
//! Read the actual style/opacity so a show/DPI update cannot stale a cache.
use std::io;
use windows::Win32::{
    Foundation::{GetLastError, SetLastError, COLORREF, ERROR_SUCCESS, HWND},
    UI::WindowsAndMessaging::{
        GetLayeredWindowAttributes, GetWindowLongPtrW, SetLayeredWindowAttributes,
        SetWindowLongPtrW, GWL_EXSTYLE, LWA_ALPHA, WS_EX_LAYERED, WS_EX_TRANSPARENT,
    },
};

fn cursor_style(current: u32, ignore: bool) -> u32 {
    let layered = current | WS_EX_LAYERED.0;
    if ignore {
        layered | WS_EX_TRANSPARENT.0
    } else {
        layered & !WS_EX_TRANSPARENT.0
    }
}

pub(super) fn set(hwnd: HWND, ignore: bool) -> tauri::Result<()> {
    apply(hwnd, ignore)
        .map(|_| ())
        .map_err(Into::into)
}

fn apply(hwnd: HWND, ignore: bool) -> io::Result<bool> {
    unsafe {
        // Zero is a valid style/previous value; only a nonzero last error fails.
        SetLastError(ERROR_SUCCESS);
        let current = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let error = GetLastError();
        if current == 0 && error != ERROR_SUCCESS {
            return Err(io::Error::from_raw_os_error(error.0 as i32));
        }
        let next = cursor_style(current, ignore);
        let mut changed = current != next;
        if changed {
            SetLastError(ERROR_SUCCESS);
            let previous = SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next as isize);
            let error = GetLastError();
            if previous == 0 && error != ERROR_SUCCESS {
                return Err(io::Error::from_raw_os_error(error.0 as i32));
            }
        }

        // WebView2 draws transparency through DirectComposition. The layered
        // parent must not introduce an unset/stale alpha mask or color key for
        // mouse hit-testing. Outside the native band TRANSPARENT still passes
        // clicks through; inside it the whole WebView can receive input.
        let mut alpha = 0;
        let mut flags = Default::default();
        let initialized = GetLayeredWindowAttributes(hwnd, None, Some(&mut alpha), Some(&mut flags)).is_ok()
            && alpha == 255 && flags == LWA_ALPHA;
        if !initialized {
            SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA)
                .map_err(io::Error::other)?;
            changed = true;
        }
        // Input style changes need no frame/size/z-order update.
        Ok(changed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::{
        core::w,
        Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, DestroyWindow, GetLayeredWindowAttributes,
            SetLayeredWindowAttributes, LWA_ALPHA, LWA_COLORKEY, WS_EX_NOACTIVATE,
            WS_EX_TOOLWINDOW, WS_POPUP,
        },
    };

    struct TestWindow(HWND);
    impl Drop for TestWindow {
        fn drop(&mut self) {
            unsafe {
                let _ = DestroyWindow(self.0);
            }
        }
    }

    #[test]
    fn repeated_hover_changes_input_without_removing_the_layered_surface() {
        let unrelated = WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0;
        let mut style = cursor_style(unrelated, true);
        for ignore in [false, true].into_iter().cycle().take(200) {
            let next = cursor_style(style, ignore);
            assert_ne!(next & WS_EX_LAYERED.0, 0);
            assert_eq!(next & unrelated, unrelated);
            assert_eq!((style ^ next) & !WS_EX_TRANSPARENT.0, 0);
            assert_eq!(next & WS_EX_TRANSPARENT.0 != 0, ignore);
            style = next;
        }
    }

    #[test]
    fn hidden_hwnd_round_trip_preserves_styles_and_skips_duplicate_writes() {
        let hwnd = unsafe {
            CreateWindowExW(
                WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW,
                w!("STATIC"),
                w!("Music Island input regression"),
                WS_POPUP,
                0,
                0,
                1,
                1,
                None,
                None,
                None,
                None,
            )
            .unwrap()
        };
        let _window = TestWindow(hwnd);
        assert!(apply(hwnd, true).unwrap());
        assert!(!apply(hwnd, true).unwrap());
        for ignore in [false, true].into_iter().cycle().take(20) {
            assert!(apply(hwnd, ignore).unwrap());
            let style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 };
            assert_ne!(style & WS_EX_LAYERED.0, 0);
            assert_ne!(style & WS_EX_NOACTIVATE.0, 0);
            assert_ne!(style & WS_EX_TOOLWINDOW.0, 0);
            assert_eq!(style & WS_EX_TRANSPARENT.0 != 0, ignore);
        }
    }

    #[test]
    fn invalid_hwnd_is_reported_instead_of_being_cached_as_applied() {
        assert!(apply(HWND::default(), true).is_err());
    }

    fn layered_parent() -> TestWindow {
        TestWindow(unsafe {
            CreateWindowExW(
                WS_EX_LAYERED | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW,
                w!("STATIC"), w!("Music Island layered input regression"), WS_POPUP,
                0, 0, 800, 240, None, None, None, None,
            ).unwrap()
        })
    }

    fn parent_alpha(hwnd: HWND) -> (u8, u32) {
        let mut color = COLORREF::default();
        let mut alpha = 0;
        let mut flags = Default::default();
        unsafe { GetLayeredWindowAttributes(hwnd, Some(&mut color), Some(&mut alpha), Some(&mut flags)) }
            .expect("layered input parent must have initialized opacity");
        (alpha, flags.0)
    }

    #[test]
    fn capture_initializes_opacity_on_an_already_layered_parent() {
        let window = layered_parent();
        apply(window.0, false).unwrap();
        assert_eq!(parent_alpha(window.0), (255, LWA_ALPHA.0));
        assert!(!apply(window.0, false).unwrap());
    }

    #[test]
    fn capture_repairs_zero_alpha_and_color_key_without_a_style_change() {
        let window = layered_parent();
        unsafe { SetLayeredWindowAttributes(window.0, COLORREF(0), 0, LWA_ALPHA | LWA_COLORKEY) }.unwrap();
        let before = unsafe { GetWindowLongPtrW(window.0, GWL_EXSTYLE) };
        apply(window.0, false).unwrap();
        assert_eq!(unsafe { GetWindowLongPtrW(window.0, GWL_EXSTYLE) }, before);
        assert_eq!(parent_alpha(window.0), (255, LWA_ALPHA.0));
        assert!(!apply(window.0, false).unwrap());
    }
}
