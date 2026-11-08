use std::{
    io,
    path::{Path, PathBuf},
};

/// The Shell and the filesystem can block, even when opening a local directory.
/// Do not call either from Tauri's window thread or wait for Explorer to exit.
pub async fn open_folder(path: PathBuf, create_if_missing: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if create_if_missing {
            std::fs::create_dir_all(&path)?;
        }
        validate_folder(&path)?;
        launch_folder(&path)
    })
    .await
    .map_err(|error| error.to_string())?
    .map_err(|error| error.to_string())
}

fn validate_folder(path: &Path) -> io::Result<()> {
    if path.metadata()?.is_dir() {
        Ok(())
    } else {
        Err(io::Error::new(
            io::ErrorKind::NotADirectory,
            "Expected a folder",
        ))
    }
}

#[cfg(windows)]
fn launch_folder(path: &Path) -> io::Result<()> {
    use std::{ffi::OsString, os::windows::ffi::OsStringExt, process::Command};
    use windows::Win32::System::SystemInformation::GetSystemWindowsDirectoryW;

    // Bypass the opener's SHOpenFolderAndSelectItems call. Explorer gets a single
    // directory argument and handles any slow shell extensions in its own process.
    let mut directory = [0; 260];
    let len = unsafe { GetSystemWindowsDirectoryW(Some(&mut directory)) } as usize;
    if len == 0 {
        return Err(io::Error::last_os_error());
    }
    if len >= directory.len() {
        return Err(io::Error::other("Windows directory path is too long"));
    }
    let explorer = PathBuf::from(OsString::from_wide(&directory[..len])).join("explorer.exe");
    Command::new(explorer).arg(path).spawn()?;
    Ok(())
}

#[cfg(not(windows))]
fn launch_folder(path: &Path) -> io::Result<()> {
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(io::Error::other)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifies_folder_before_launching_explorer() {
        let executable = std::env::current_exe().unwrap();
        let folder = executable.parent().unwrap();
        assert!(validate_folder(folder).is_ok());
        assert_eq!(
            validate_folder(&executable).unwrap_err().kind(),
            io::ErrorKind::NotADirectory
        );
        assert_eq!(
            validate_folder(&folder.join("music-island-missing-folder"))
                .unwrap_err()
                .kind(),
            io::ErrorKind::NotFound
        );
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "Opens a real Explorer window; use the isolated Windows QA fixture"]
    fn opens_explorer_for_smoke_fixture() {
        let path = PathBuf::from(
            std::env::var_os("MUSIC_ISLAND_TEST_EXPLORER_DIR").expect("isolated fixture path"),
        );
        tauri::async_runtime::block_on(open_folder(path, false)).unwrap();
    }
}
