use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_opener::OpenerExt;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataFolder {
    path: String,
    bytes: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataSnapshot {
    folders: Vec<DataFolder>,
    models: u64,
    history: u64,
    runtime: u64,
    total: u64,
    confirmation: String,
}
static CONFIRMATION: OnceLock<Mutex<Option<String>>> = OnceLock::new();
fn roots() -> Result<Vec<PathBuf>, String> {
    let roaming = PathBuf::from(std::env::var_os("APPDATA").ok_or("APPDATA unavailable")?);
    let local = PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA unavailable")?);
    Ok(vec![
        roaming.join("Music Island"),
        roaming.join("com.redheadesign.music-island"),
        local.join("com.redheadesign.music-island"),
    ])
}
#[tauri::command]
pub async fn get_data_snapshot() -> Result<DataSnapshot, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let paths = roots()?;
        let mut folders = Vec::new();
        for path in &paths {
            let bytes = handy_core::storage::owned_bytes(path).map_err(|e| e.to_string())?;
            folders.push(DataFolder {
                path: path.to_string_lossy().into(),
                bytes,
            });
        }
        let dictation = paths[0].join("dictation");
        let size = |name| handy_core::storage::owned_bytes(&dictation.join(name)).unwrap_or(0);
        let confirmation = format!(
            "{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        *CONFIRMATION
            .get_or_init(Default::default)
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = Some(confirmation.clone());
        Ok(DataSnapshot {
            total: folders.iter().map(|f| f.bytes).sum(),
            folders,
            models: size("models") + size("huggingface"),
            history: size("history.db") + size("recordings"),
            runtime: size("runtime"),
            confirmation,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn open_data_folder(app: tauri::AppHandle) -> Result<(), String> {
    let root = roots()?.remove(0);
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(root.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn delete_all_data_and_exit(app: tauri::AppHandle, confirmation: String) -> Result<(), String> {
    let mut pending = CONFIRMATION
        .get_or_init(Default::default)
        .lock()
        .map_err(|e| e.to_string())?;
    if pending.as_deref() != Some(&confirmation) {
        return Err("Refresh the data summary before confirming removal".into());
    }
    use std::os::windows::process::CommandExt;
    // The helper contains the same fixed root list and never accepts a path.
    std::process::Command::new(std::env::current_exe().map_err(|e| e.to_string())?)
        .args(["--cleanup-owned-data", &std::process::id().to_string()])
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| e.to_string())?;
    *pending = None;
    let _ = app.autolaunch().disable();
    crate::shutdown::request(&app);
    Ok(())
}
pub fn run_cleanup_helper() -> bool {
    let args: Vec<_> = std::env::args().collect();
    if args.get(1).map(String::as_str) != Some("--cleanup-owned-data") {
        return false;
    }
    let Some(pid) = args.get(2).and_then(|s| s.parse::<u32>().ok()) else {
        return true;
    };
    if pid == std::process::id() {
        return true;
    }
    use windows::Win32::{
        Foundation::{CloseHandle, WAIT_OBJECT_0},
        System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE},
    };
    unsafe {
        match OpenProcess(PROCESS_SYNCHRONIZE, false, pid) {
            Ok(process) => {
                let result = WaitForSingleObject(process, 120_000);
                let _ = CloseHandle(process);
                if result != WAIT_OBJECT_0 {
                    return true;
                }
            }
            Err(error)
                if error.code()
                    == windows::Win32::Foundation::ERROR_INVALID_PARAMETER.to_hresult() => {}
            Err(_) => return true,
        }
    }
    if let Ok(paths) = roots() {
        // WebView subprocesses can release their profile shortly after the host.
        for _ in 0..30 {
            let mut done = true;
            for path in &paths {
                if handy_core::storage::remove_owned(path, path).is_err() {
                    done = false;
                }
            }
            if done {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    }
    true
}
