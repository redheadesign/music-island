//! Run explicitly in a dedicated test process: its window station deliberately
//! remains isolated until process exit, including on assertion failure.
use super::*;
use std::time::Duration;
use windows::Win32::System::Threading::{GetCurrentProcessId, GetCurrentThreadId};

static TEST_DESKTOP: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);

fn shared(text: &str, target_process: u32) -> Arc<WinTxShared> {
    Arc::new(WinTxShared {
        state: Mutex::new(TxState::new()),
        text: text.into(),
        target_process,
        quiet_period: Duration::from_millis(200),
        window: std::sync::atomic::AtomicIsize::new(0),
        settled: std::sync::atomic::AtomicBool::new(false),
        snapshot: Mutex::new(Vec::new()),
        saved_bitmap: Mutex::new(None),
        app_handle: None,
        auto_submit: false,
        auto_submit_key: AutoSubmitKey::Enter,
        preserve_transcript: false,
    })
}

unsafe fn write(hwnd: HWND, text: &str) {
    OpenClipboard(Some(hwnd)).unwrap();
    EmptyClipboard().unwrap();
    render_text(&shared(text, 0));
    CloseClipboard().unwrap();
}

unsafe fn read(hwnd: HWND) -> String {
    OpenClipboard(Some(hwnd)).unwrap();
    let handle = GetClipboardData(CF_UNICODETEXT.0 as u32).unwrap();
    let data = GlobalLock(HGLOBAL(handle.0)) as *const u16;
    assert!(!data.is_null());
    let mut length = 0;
    while length < 4096 && *data.add(length) != 0 {
        length += 1;
    }
    let text = String::from_utf16_lossy(std::slice::from_raw_parts(data, length));
    let _ = GlobalUnlock(HGLOBAL(handle.0));
    CloseClipboard().unwrap();
    text
}

fn begin(text: &str, target: u32) -> (Arc<WinTxShared>, thread::JoinHandle<()>) {
    let tx = shared(text, target);
    let worker_tx = tx.clone();
    let (ready, receiver) = std::sync::mpsc::channel();
    let worker = thread::spawn(move || {
        attach_to_test_desktop();
        pump_thread(worker_tx, ready)
    });
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if let Ok(result) = receiver.try_recv() {
            result.unwrap();
            break;
        }
        assert!(
            Instant::now() < deadline,
            "clipboard worker publication deadline"
        );
        // EmptyClipboard synchronously notifies the marker's owner window.
        // This test thread owns that window, so keep its queue responsive.
        pump_test_messages();
        thread::sleep(Duration::from_millis(1));
    }
    tx.state.lock().unwrap().injected_at = Some(Instant::now());
    (tx, worker)
}

fn attach_to_test_desktop() {
    unsafe {
        use windows::Win32::System::LibraryLoader::GetProcAddress;
        let user32 = GetModuleHandleW(w!("user32.dll")).unwrap();
        let set_desktop: unsafe extern "system" fn(isize) -> i32 = std::mem::transmute(
            GetProcAddress(user32, windows::core::s!("SetThreadDesktop")).unwrap(),
        );
        assert_ne!(
            set_desktop(TEST_DESKTOP.load(std::sync::atomic::Ordering::Acquire)),
            0
        );
    }
}

fn pump_test_messages() {
    unsafe {
        use windows::Win32::UI::WindowsAndMessaging::{PeekMessageW, PM_REMOVE};
        let mut msg = MSG::default();
        while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
            let _ = DispatchMessageW(&msg);
        }
    }
}

#[test]
#[ignore = "dedicated process: creates an isolated Windows clipboard/window station"]
fn isolated_windows_delayed_read_manager_and_new_copy() {
    unsafe {
        // No switch back, even on panic: background workers must never gain
        // access to the interactive user's window station or clipboard.
        let user32 = GetModuleHandleW(w!("user32.dll")).unwrap();
        use windows::core::s;
        use windows::Win32::System::LibraryLoader::GetProcAddress;
        let create_station: unsafe extern "system" fn(
            *const u16,
            u32,
            u32,
            *const std::ffi::c_void,
        ) -> isize =
            std::mem::transmute(GetProcAddress(user32, s!("CreateWindowStationW")).unwrap());
        let set_station: unsafe extern "system" fn(isize) -> i32 =
            std::mem::transmute(GetProcAddress(user32, s!("SetProcessWindowStation")).unwrap());
        let create_desktop: unsafe extern "system" fn(
            *const u16,
            *const u16,
            *const std::ffi::c_void,
            u32,
            u32,
            *const std::ffi::c_void,
        ) -> isize = std::mem::transmute(GetProcAddress(user32, s!("CreateDesktopW")).unwrap());
        let set_desktop: unsafe extern "system" fn(isize) -> i32 =
            std::mem::transmute(GetProcAddress(user32, s!("SetThreadDesktop")).unwrap());
        let station = create_station(std::ptr::null(), 0, 0x000f037f, std::ptr::null());
        assert_ne!(station, 0, "CreateWindowStationW");
        assert_ne!(set_station(station), 0, "SetProcessWindowStation");
        let name = wide(&format!("MusicIslandPasteTest{}", GetCurrentThreadId()));
        let desktop = create_desktop(
            name.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            0,
            0x000f01ff,
            std::ptr::null(),
        );
        assert_ne!(desktop, 0, "CreateDesktopW");
        assert_ne!(set_desktop(desktop), 0, "SetThreadDesktop");
        TEST_DESKTOP.store(desktop, std::sync::atomic::Ordering::Release);

        let instance = HINSTANCE(GetModuleHandleW(PCWSTR::null()).unwrap().0);
        ensure_window_class(instance);
        let reader = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            CLASS_NAME,
            w!("Paste reader"),
            WINDOW_STYLE::default(),
            0,
            0,
            0,
            0,
            Some(HWND_MESSAGE),
            None,
            Some(instance),
            None,
        )
        .unwrap();
        let target = GetCurrentProcessId();

        write(reader, "saved clipboard marker");
        assert_eq!(read(reader), "saved clipboard marker");
        let (tx, worker) = begin("delayed dictated phrase", target);
        thread::sleep(Duration::from_millis(900)); // well beyond legacy 60ms
        assert_eq!(read(reader), "delayed dictated phrase");
        assert!(tx.state.lock().unwrap().any_receipt_after_injection());
        worker.join().unwrap();
        assert_eq!(
            read(reader),
            "saved clipboard marker",
            "saved formats: {}, settled: {}, owner lost: {}",
            tx.snapshot.lock().unwrap().len(),
            tx.settled.load(std::sync::atomic::Ordering::Acquire),
            tx.state.lock().unwrap().ownership_lost
        );

        write(reader, "saved clipboard marker");
        let (tx, worker) = begin("manager read must not restore old text", u32::MAX);
        assert_eq!(read(reader), "manager read must not restore old text");
        assert!(!tx.state.lock().unwrap().any_receipt_after_injection());
        tx.state.lock().unwrap().published_at = Instant::now() - super::super::RESTORE_TIMEOUT;
        worker.join().unwrap();
        assert_eq!(read(reader), "manager read must not restore old text");

        let (_tx, worker) = begin("pending dictated phrase", target);
        write(reader, "new user copy wins");
        worker.join().unwrap();
        assert_eq!(read(reader), "new user copy wins");

        // Production Windows now uses the synchronous 3.0.2 finish path.
        // Exercise its ordering and sequence guard with a real isolated
        // clipboard, including a newer copy between injection and restore.
        use crate::clipboard::{
            clipboard_is_unchanged, clipboard_restore_delay_ms, finish_clipboard_paste,
        };
        write(reader, "original rapid-dictation marker");
        for phrase in ["phrase one", "phrase two", "phrase three"].into_iter().cycle().take(60) {
            let saved = read(reader);
            write(reader, phrase);
            let published = GetClipboardSequenceNumber();
            assert_eq!(read(reader), phrase);
            finish_clipboard_paste(Ok(()), 0, ClipboardHandling::DontModify, || {
                if clipboard_is_unchanged(published, GetClipboardSequenceNumber()) {
                    write(reader, &saved);
                }
            }).unwrap();
            assert_eq!(read(reader), "original rapid-dictation marker");
        }
        let saved = read(reader);
        write(reader, "dictated text before a new copy");
        let published = GetClipboardSequenceNumber();
        write(reader, "new user copy during synchronous insertion");
        finish_clipboard_paste(Ok(()), 0, ClipboardHandling::DontModify, || {
            if clipboard_is_unchanged(published, GetClipboardSequenceNumber()) {
                write(reader, &saved);
            }
        }).unwrap();
        assert_eq!(read(reader), "new user copy during synchronous insertion");

        // Real Windows Edit control. Deliver WM_PASTE after the old restore
        // window to reproduce replacing the selection with saved clipboard text.
        use windows::Win32::{
            Foundation::{LPARAM, WPARAM},
            UI::WindowsAndMessaging::{
                GetWindowTextW, SendMessageW, SetWindowTextW, WM_PASTE, WS_CHILD,
            },
        };
        let editor = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            w!("Edit"),
            w!("selected text"),
            WS_CHILD,
            0,
            0,
            160,
            24,
            Some(reader),
            None,
            Some(instance),
            None,
        ).unwrap();
        const EM_SETSEL: u32 = 0x00b1;
        let paste_selected = || {
            SetWindowTextW(editor, w!("selected text")).unwrap();
            SendMessageW(editor, EM_SETSEL, Some(WPARAM(0)), Some(LPARAM(-1)));
            SendMessageW(editor, WM_PASTE, None, None);
            let mut buffer = [0; 64];
            let length = GetWindowTextW(editor, &mut buffer) as usize;
            String::from_utf16_lossy(&buffer[..length])
        };

        let restore = ClipboardHandling::DontModify;
        let keep = ClipboardHandling::CopyToClipboard;
        for (handling, delay_ms, expected) in [
            (restore, 60, "old copied text"),
            (restore, clipboard_restore_delay_ms(60, restore), "latest dictated phrase"),
            (keep, clipboard_restore_delay_ms(60, keep), "latest dictated phrase"),
        ] {
            write(reader, "latest dictated phrase");
            let reader_handle = reader.0 as isize;
            let (started, received_start) = std::sync::mpsc::channel();
            let worker = thread::spawn(move || {
                attach_to_test_desktop();
                started.send(Instant::now()).unwrap();
                finish_clipboard_paste(Ok(()), delay_ms, handling, || {
                    write(HWND(reader_handle as *mut _), "old copied text");
                }).unwrap();
            });
            let start = received_start.recv_timeout(Duration::from_secs(2)).unwrap();
            while start.elapsed() < Duration::from_millis(250) {
                pump_test_messages();
                thread::sleep(Duration::from_millis(1));
            }
            let inserted = paste_selected();
            while !worker.is_finished() && start.elapsed() < Duration::from_secs(4) {
                pump_test_messages();
                thread::sleep(Duration::from_millis(1));
            }
            assert!(worker.is_finished(), "clipboard restore did not finish");
            worker.join().unwrap();
            assert_eq!(inserted, expected);
            assert_eq!(read(reader), if handling == restore { "old copied text" } else { expected });
        }
        DestroyWindow(editor).unwrap();
        DestroyWindow(reader).unwrap();
    }
}
