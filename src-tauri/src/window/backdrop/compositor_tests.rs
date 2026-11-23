//! These samples are restricted to our own opaque checker window. No desktop
//! capture or private application image is stored or used by the application.
use super::*;
use windows::{
    core::w,
    Win32::{
        Foundation::{COLORREF, LPARAM, LRESULT, RECT, WPARAM},
        Graphics::{
            Dwm::DwmFlush,
            Gdi::{
                BeginPaint, CreateSolidBrush, DeleteObject, EndPaint, FillRect, GetDC, GetPixel,
                RedrawWindow, ReleaseDC, HGDIOBJ, PAINTSTRUCT, RDW_INVALIDATE, RDW_UPDATENOW,
            },
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
        let mode = GetWindowLongPtrW(hwnd, GWLP_USERDATA);
        if mode != 0 {
            let bar = if mode == 1 { 4 } else { 48 };
            for x in (0..640).step_by(bar as usize) {
                let brush =
                    CreateSolidBrush(COLORREF(if x % (bar * 2) == 0 { 0xffffff } else { 0 }));
                FillRect(
                    dc,
                    &RECT {
                        left: x,
                        top: 0,
                        right: x + bar,
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

fn pump_messages() {
    let mut message = MSG::default();
    unsafe {
        while PeekMessageW(&mut message, None, 0, 0, PM_REMOVE).as_bool() {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
}

fn pump() {
    let end = std::time::Instant::now() + std::time::Duration::from_millis(500);
    while std::time::Instant::now() < end {
        pump_messages();
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
                frost: None,
                blur_radius: None,
            },
            BackdropRegion {
                left: 20.0,
                top: 80.0,
                width: 100.0,
                height: 40.0,
                radii: [20.0; 4],
                opacity: 1.0,
                frost: None,
                blur_radius: None,
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
        for global in [0.0, 1.0] {
            let mut mixed = surfaces.clone();
            mixed[1].frost = Some(1.0 - global);
            compositor.update(
                640.0,
                400.0,
                &mixed.map(|surface| surface.physical(1.0, global)),
            )?;
            pump();
            let dc = GetDC(None);
            let contrast = |x, y| {
                ((GetPixel(dc, 100 + x, 100 + y).0 & 255) as i32
                    - (GetPixel(dc, 104 + x, 100 + y).0 & 255) as i32)
                    .abs()
            };
            let (player, satellite) = (contrast(200, 140), contrast(64, 96));
            ReleaseDC(None, dc);
            println!("independent frost global={global}: player={player}, satellite={satellite}");
            let (clear, frosted) = if global == 0.0 {
                (player, satellite)
            } else {
                (satellite, player)
            };
            assert!(clear >= 240 && frosted <= 20);
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
        // Present the opening frame without starting desktop capture. This is
        // the same host frame used when the GPU lens is still waiting on WGC.
        let first_frame = super::super::geometry::BackdropFrame {
            generation: 1,
            enabled: true,
            viewport_width: 640.0,
            viewport_height: 400.0,
            scale: 1.0,
            frost: 0.72,
            regions: vec![surfaces[0].clone()],
            lens: Some(super::super::geometry::DesktopLensSettings {
                region: 0,
                bend: 0.5,
                dispersion: 0.14,
                snapshot: false,
                reduced_motion: false,
            }),
            prewarm_lens: false,
        };
        compositor.update(640.0, 400.0, &first_frame.host_regions(first_frame.lens))?;
        let mut opening_contrast = cleared;
        for _ in 0..6 {
            pump_messages();
            DwmFlush()?;
            let dc = GetDC(None);
            opening_contrast = ((GetPixel(dc, 300, 240).0 & 255) as i32
                - (GetPixel(dc, 304, 240).0 & 255) as i32)
                .abs();
            ReleaseDC(None, dc);
            if opening_contrast <= 20 {
                break;
            }
        }
        assert!(
            opening_contrast <= 20,
            "first-frame frost was waiting for the GPU lens: stripe contrast={opening_contrast}"
        );

        SetWindowLongPtrW(checker, GWLP_USERDATA, 2);
        let _ = RedrawWindow(Some(checker), None, None, RDW_INVALIDATE | RDW_UPDATENOW);
        DwmFlush()?;
        compositor.update(640.0, 400.0, &regions(1.0)[..1])?;
        pump();
        let profile = || {
            let dc = GetDC(None);
            let values: Vec<_> = (150..430)
                .step_by(8)
                .map(|x| GetPixel(dc, 100 + x, 240).0 & 255)
                .collect();
            ReleaseDC(None, dc);
            values
        };
        let native = profile();
        let mut body = regions(1.0)[0].clone();
        body.blur_radius = Some(24.0);
        compositor.update(640.0, 400.0, std::slice::from_ref(&body))?;
        pump();
        let stronger = profile();
        let detail = |samples: &[u32]| {
            let center = &samples[8..26];
            center.iter().max().unwrap() - center.iter().min().unwrap()
        };
        println!(
            "wide stripe contrast: stock={}, custom={}",
            detail(&native),
            detail(&stronger)
        );
        assert!(detail(&native) > 15, "wide checker must be visible first");
        assert!(detail(&stronger) * 4 < detail(&native) * 3);
        let brush = compositor.regions[0].frost.clone();
        body.blur_radius = Some(12.0);
        compositor.update(640.0, 400.0, std::slice::from_ref(&body))?;
        assert_eq!(compositor.regions[0].frost, brush);
        body.blur_radius = None;
        compositor.update(640.0, 400.0, &[body])?;
        pump();
        assert_eq!(profile(), native);
        assert!(compositor.regions[0].frost.is_none());

        // A synthetic replacement frame exercises the same native reveal as
        // WGC without needing to capture the user's desktop. It starts well
        // after the first layer to reproduce a slow first capture.
        let plate = compositor.compositor.CreateSpriteVisual()?;
        plate.SetSize(Vector2 { X: 80.0, Y: 40.0 })?;
        plate.SetOffset(Vector3 { X: 180.0, Y: 120.0, Z: 0.0 })?;
        plate.SetBrush(&compositor.compositor.CreateColorBrushWithColor(windows::UI::Color {
            A: 255, R: 0, G: 0, B: 0,
        })?)?;
        let incoming = compositor.compositor.CreateSpriteVisual()?;
        incoming.SetSize(plate.Size()?)?;
        incoming.SetOffset(plate.Offset()?)?;
        incoming.SetBrush(&compositor.compositor.CreateColorBrushWithColor(windows::UI::Color {
            A: 255, R: 255, G: 255, B: 255,
        })?)?;
        incoming.SetIsVisible(false)?;
        let children = compositor.root.Children()?;
        children.InsertAtTop(&plate)?;
        children.InsertAtTop(&incoming)?;
        pump();
        let done = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let callback = done.clone();
        let _batch = desktop_lens::fade_in(&compositor.compositor, &incoming, move || {
            callback.store(true, std::sync::atomic::Ordering::Release);
        })?;
        let start = std::time::Instant::now();
        let mut values = Vec::new();
        let dc = GetDC(None);
        while start.elapsed() < std::time::Duration::from_millis(550) {
            pump_messages();
            DwmFlush()?;
            values.push((GetPixel(dc, 300, 240).0 & 255) as i32);
            std::thread::sleep(std::time::Duration::from_millis(8));
        }
        ReleaseDC(None, dc);
        let first = values[0];
        let jump = values.windows(2).map(|pair| (pair[1] - pair[0]).abs()).max().unwrap();
        assert!(first < 100 && jump < 110, "late GPU reveal flashed: first={first}, max step={jump}");
        assert!(values.contains(&255) && done.load(std::sync::atomic::Ordering::Acquire), "GPU reveal did not settle");
        drop(compositor);
        Ok(())
    }
}
