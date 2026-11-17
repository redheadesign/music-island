use super::*;

#[test]
fn shell_link_can_use_a_worker_with_an_existing_mta_apartment() {
    std::thread::spawn(|| unsafe {
        windows::Win32::System::Com::CoInitializeEx(
            None,
            windows::Win32::System::Com::COINIT_MULTITHREADED,
        )
        .ok()
        .unwrap();
        {
            let apartment = Apartment::new().unwrap();
            assert!(!apartment.0);
            let link: IShellLinkW =
                CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
            link.SetDescription(windows::core::w!("MTA fixture"))
                .unwrap();
            let mut description = vec![0; 64];
            link.GetDescription(&mut description).unwrap();
            assert_eq!(
                String::from_utf16(&description[..11]).unwrap(),
                "MTA fixture"
            );
        }
        CoUninitialize();
    })
    .join()
    .unwrap();
}

#[test]
fn real_windows_shortcuts_and_isolated_run_entry_roundtrip_preserves_metadata() {
    let temp = tempfile::tempdir().unwrap();
    // The runner can expose the user directory through an 8.3 TEMP alias.
    // Windows Shell returns the long target path when it reloads the link.
    let folder = temp.path().canonicalize().unwrap();
    let folder = Path::new(folder.to_str().unwrap().trim_start_matches(r"\\?\"));
    let roots: Vec<_> = ["Desktop", "Programs", "Startup", "TaskBar"]
        .iter()
        .map(|p| folder.join(p))
        .collect();
    for root in &roots {
        fs::create_dir(root).unwrap();
    }
    let stale = roots[0].join(format!(".music-island-{}-0.lnk", std::process::id()));
    fs::write(&stale, b"previous crashed process with a recycled PID").unwrap();
    let install = folder.join("YandexMusic");
    fs::create_dir(&install).unwrap();
    let executable = install.join("Yandex Music.exe");
    fs::write(&executable, b"fixture, never executed").unwrap();
    let run_key = format!(
        r"Software\MusicIslandLaunchTests\{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    );
    struct Cleanup(String);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = RegKey::predef(HKEY_CURRENT_USER).delete_subkey_all(&self.0);
        }
    }
    let _cleanup = Cleanup(run_key.clone());
    let (run, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey(&run_key)
        .unwrap();
    let startup = format!("\"{}\" --autostart", executable.display());
    run.set_value("Yandex", &startup).unwrap();
    run.set_value("Unrelated", &r#""C:\Other.exe" --unrelated"#)
        .unwrap();
    let backend = WindowsBackend {
        roots: roots.clone(),
        menu_root: roots[1].clone(),
        install,
        run_key,
        _apartment: Apartment::new().unwrap(),
    };
    for root in &roots {
        unsafe {
            let link: IShellLinkW =
                CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
            link.SetPath(PCWSTR(wide(executable.as_os_str()).as_ptr()))
                .unwrap();
            link.SetArguments(PCWSTR(wide(std::ffi::OsStr::new("--original")).as_ptr()))
                .unwrap();
            link.SetDescription(windows::core::w!("Preserve this description"))
                .unwrap();
            link.SetWorkingDirectory(PCWSTR(wide(folder.as_os_str()).as_ptr()))
                .unwrap();
            let persist: IPersistFile = link.cast().unwrap();
            persist
                .Save(
                    PCWSTR(wide(root.join("Музыка.lnk").as_os_str()).as_ptr()),
                    true,
                )
                .unwrap();
        }
    }
    for root in &roots {
        let link = backend.open_link(&root.join("Музыка.lnk")).unwrap();
        let (target, _) = WindowsBackend::link_values(&link).unwrap();
        assert!(same_path(&target, &executable), "{target:?} vs {executable:?}");
    }
    let journal = folder.join("launch.json");
    super::super::prepare_with(&backend, &journal, &executable, 49200).unwrap();
    assert_eq!(
        super::super::load(&journal).unwrap().unwrap().entries.len(),
        5
    );
    super::super::prepare_with(&backend, &journal, &executable, 49200).unwrap();
    assert!(run
        .get_value::<String, _>("Yandex")
        .unwrap()
        .contains("--remote-debugging-port=49200"));
    for root in &roots {
        let path = root.join("Музыка.lnk");
        let link = backend.open_link(&path).unwrap();
        let (target, args) = WindowsBackend::link_values(&link).unwrap();
        assert!(same_path(&target, &executable));
        assert_eq!(
            args,
            "--original --remote-debugging-port=49200 --remote-debugging-address=127.0.0.1"
        );
        let mut description = vec![0; 1024];
        unsafe {
            link.GetDescription(&mut description).unwrap();
        }
        assert_eq!(
            String::from_utf16(&description[..description.iter().position(|c| *c == 0).unwrap()])
                .unwrap(),
            "Preserve this description"
        );
    }
    super::super::restore_with(&backend, &journal).unwrap();
    assert_eq!(
        fs::read(&stale).unwrap(),
        b"previous crashed process with a recycled PID"
    );
    assert_eq!(run.get_value::<String, _>("Yandex").unwrap(), startup);
    assert_eq!(
        run.get_value::<String, _>("Unrelated").unwrap(),
        r#""C:\Other.exe" --unrelated"#
    );
    assert!(!journal.exists());
    for root in &roots {
        assert_eq!(
            WindowsBackend::link_values(&backend.open_link(&root.join("Музыка.lnk")).unwrap())
                .unwrap()
                .1,
            "--original"
        );
    }
}

#[test]
fn backup_cannot_change_shortcuts_outside_supported_roots_or_foreign_executables() {
    let folder = tempfile::tempdir().unwrap();
    let backend = WindowsBackend {
        roots: vec![folder.path().join("Desktop")],
        menu_root: folder.path().join("Programs"),
        install: folder.path().join("YandexMusic"),
        run_key: format!(
            r"Software\MusicIslandLaunchTests\unused-{}",
            std::process::id()
        ),
        _apartment: Apartment::new().unwrap(),
    };
    assert!(backend
        .validate_location(&Location::Shortcut(folder.path().join("Outside.lnk")))
        .is_err());
    assert!(backend
        .validate_location(&Location::Shortcut(
            folder.path().join("Desktop/../Outside.lnk")
        ))
        .is_err());
    assert!(!backend.valid_executable(&folder.path().join("YandexMusic/Another App.exe")));
    assert!(!backend.valid_executable(&folder.path().join("Another/Yandex Music.exe")));
}
