//! These samples are restricted to our own opaque checker window. No desktop
//! capture or private application image is stored or used by the application.
use super::*;
use windows::{
    core::w,
    Win32::{
        Foundation::{COLORREF, LPARAM, LRESULT, RECT, WPARAM},
        Graphics::Gdi::{
            BeginPaint, CreateSolidBrush, DeleteObject, EndPaint, FillRect, GetDC, GetPixel,
            ReleaseDC, HGDIOBJ, PAINTSTRUCT,
        },
        System::LibraryLoader::GetModuleHandleW,
        UI::WindowsAndMessaging::*,
    },
};

unsafe extern "system" fn checker_proc(
    hwnd: HWND,
    message: u32,
    wp: WPARAM,
    lp: LPARAM,
) -> LRESULT {
    if message == WM_ERASEBKGND {
        return LRESULT(1);
    }
    if message == WM_PAINT {
        let mut paint = PAINTSTRUCT::default();
        let dc = BeginPaint(hwnd, &mut paint);
        if GetWindowLongPtrW(hwnd, GWLP_USERDATA) == 1 {
            for x in (0..640).step_by(4) {
                let brush = CreateSolidBrush(COLORREF(if x % 8 == 0 { 0xffffff } else { 0 }));
                FillRect(
                    dc,
                    &RECT {
                        left: x,
                        top: 0,
                        right: x + 4,
                        bottom: 400,
                    },
                    brush,
                );
                let _ = DeleteObject(HGDIOBJ(brush.0));
            }
        }
        let _ = EndPaint(hwnd, &paint);
        return LRESULT(0);
    }
    DefWindowProcW(hwnd, message, wp, lp)
}

fn pump() {
    let end = std::time::Instant::now() + std::time::Duration::from_millis(500);
    while std::time::Instant::now() < end {
        let mut message = MSG::default();
        unsafe {
            while PeekMessageW(&mut message, None, 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(8));
    }
}

struct TestWindows(Vec<HWND>);
impl Drop for TestWindows {
    fn drop(&mut self) {
        for window in self.0.iter().rev() {
            let _ = unsafe { DestroyWindow(*window) };
        }
    }
}

/// Run in an interactive Windows 11 session, with transparency enabled. It
/// exercises the production compositor and verifies full contrast in the gap
/// and cut corners, attenuation inside the card, and immediate cleanup.
#[test]
#[ignore = "requires an interactive Windows 11 compositor, enabled transparency, and no covering windows"]
fn only_the_actual_silhouette_blurs_the_underlying_checker() -> windows::core::Result<()> {
    unsafe {
        let instance = GetModuleHandleW(None)?;
        let class = w!("MusicIslandBackdropCharacterization");
        RegisterClassW(&WNDCLASSW {
            lpfnWndProc: Some(checker_proc),
            hInstance: instance.into(),
            lpszClassName: class,
            ..Default::default()
        });
        let mut windows = TestWindows(Vec::new());
        let checker = CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
            class,
            w!("Music Island own checker"),
            WS_POPUP,
            100,
            100,
            640,
            400,
            None,
            None,
            Some(instance.into()),
            None,
        )?;
        windows.0.push(checker);
        SetWindowLongPtrW(checker, GWLP_USERDATA, 1);
        let _ = ShowWindow(checker, SW_SHOWNOACTIVATE);
        let overlay = CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_LAYERED | WS_EX_TRANSPARENT,
            class,
            w!("Music Island own blur test"),
            WS_POPUP,
            100,
            100,
            640,
            400,
            None,
            None,
            Some(instance.into()),
            None,
        )?;
        windows.0.push(overlay);
        SetLayeredWindowAttributes(overlay, COLORREF(0), 255, LWA_ALPHA)?;
        let mut compositor = HostBackdrop::new(overlay)?;
        let surfaces = [
            BackdropRegion {
                left: 140.0,
                top: 80.0,
                width: 300.0,
                height: 180.0,
                radii: [0.0, 0.0, 35.0, 35.0],
                opacity: 1.0,
            },
            BackdropRegion {
                left: 20.0,
                top: 80.0,
                width: 100.0,
                height: 40.0,
                radii: [20.0; 4],
                opacity: 1.0,
            },
        ];
        let regions = |frost| {
            surfaces
                .each_ref()
                .map(|surface| surface.physical(1.0, frost))
        };
        compositor.update(640.0, 400.0, &regions(0.72))?;
        let _ = ShowWindow(overlay, SW_SHOWNOACTIVATE);
        pump();
        let dc = GetDC(None);
        let sample = |x, y| (GetPixel(dc, 100 + x, 100 + y).0 & 255) as i32;
        let outside = (sample(48, 40) - sample(52, 40)).abs();
        let inside = (sample(200, 140) - sample(204, 140)).abs();
        let gap = (sample(128, 95) - sample(132, 95)).abs();
        let cut_corner = (sample(144, 255) - sample(148, 255)).abs();
        ReleaseDC(None, dc);
        println!("checker contrast outside={outside}, silhouette={inside}, gap={gap}, cut corner={cut_corner}");
        assert!(
            outside >= 240 && gap >= 240 && cut_corner >= 240,
            "blur escaped the actual visual silhouette"
        );
        assert!(
            (24..=110).contains(&inside),
            "the frosted surface should retain some contrast from the checker"
        );
        let fitted_mask = compositor.regions[0].tiles[0].2.clone();
        for (frost, expected) in [(0.0, 240..=255), (1.0, 0..=20)] {
            compositor.update(640.0, 400.0, &regions(frost))?;
            pump();
            let dc = GetDC(None);
            let delta = ((GetPixel(dc, 300, 240).0 & 255) as i32
                - (GetPixel(dc, 304, 240).0 & 255) as i32)
                .abs();
            ReleaseDC(None, dc);
            println!("checker contrast at frost {frost}: {delta}");
            assert!(expected.contains(&delta));
            assert_eq!(compositor.regions[0].tiles[0].2, fitted_mask);
        }
        compositor.clear();
        pump();
        let dc = GetDC(None);
        let cleared = ((GetPixel(dc, 300, 240).0 & 255) as i32
            - (GetPixel(dc, 304, 240).0 & 255) as i32)
            .abs();
        ReleaseDC(None, dc);
        assert!(
            cleared >= 240,
            "removing the visual did not restore desktop contrast"
        );
        drop(compositor);
        Ok(())
    }
}
