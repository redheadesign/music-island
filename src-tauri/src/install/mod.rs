//! Portable install supersede (#29): newer cleans older copies; older defers to newer.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

const RECORD_FILE: &str = "install.json";
const ENTRY_EXE_NAME: &str = "music-island.exe";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallRecord {
    pub path: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewerHandoff {
    pub path: String,
    pub version: String,
}

#[derive(Debug, Default)]
pub struct InstallState {
    pub newer_handoff: Mutex<Option<NewerHandoff>>,
}

#[derive(Debug)]
pub enum ReconcileResult {
    Continue,
    DeferToNewer(NewerHandoff),
}

pub fn app_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|base| PathBuf::from(base).join("Music Island"))
}

fn record_path() -> Option<PathBuf> {
    app_dir().map(|dir| dir.join(RECORD_FILE))
}

pub fn load_record() -> Option<InstallRecord> {
    let path = record_path()?;
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn save_record(path: &Path, version: &str) -> anyhow::Result<()> {
    let dir = app_dir().ok_or_else(|| anyhow::anyhow!("APPDATA missing"))?;
    fs::create_dir_all(&dir)?;
    let record = InstallRecord {
        path: normalize_path(path),
        version: normalize_version(version),
    };
    let file = dir.join(RECORD_FILE);
    fs::write(file, serde_json::to_string_pretty(&record)?)?;
    Ok(())
}

fn normalize_path(path: &Path) -> String {
    let raw = path.display().to_string();
    raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_string()
}

fn normalize_version(raw: &str) -> String {
    raw.trim().trim_start_matches('v').trim_start_matches('V').to_string()
}

fn parse_semver(raw: &str) -> Option<(u64, u64, u64)> {
    let cleaned = normalize_version(raw);
    let mut parts = cleaned.split(|c| c == '-' || c == '+');
    let core = parts.next()?;
    let mut nums = core.split('.');
    let major = nums.next()?.parse().ok()?;
    let minor = nums.next().unwrap_or("0").parse().ok()?;
    let patch = nums.next().unwrap_or("0").parse().ok()?;
    Some((major, minor, patch))
}

fn is_newer(candidate: &str, baseline: &str) -> bool {
    match (parse_semver(candidate), parse_semver(baseline)) {
        (Some(a), Some(b)) => a > b,
        _ => normalize_version(candidate) != normalize_version(baseline),
    }
}

fn same_version(a: &str, b: &str) -> bool {
    normalize_version(a) == normalize_version(b)
}

fn paths_equal(a: &Path, b: &Path) -> bool {
    let na = normalize_path(a).to_ascii_lowercase();
    let nb = normalize_path(b).to_ascii_lowercase();
    na == nb
}

fn read_file_version(path: &Path) -> Option<String> {
    if !path.is_file() {
        return None;
    }
    #[cfg(windows)]
    {
        let path_s = normalize_path(path).replace('\'', "''");
        let script = format!(
            "$v = [System.Diagnostics.FileVersionInfo]::GetVersionInfo('{path_s}'); \
             if ($v.ProductVersion) {{ $v.ProductVersion }} else {{ $v.FileVersion }}"
        );
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-WindowStyle",
                "Hidden",
                "-Command",
                &script,
            ])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if text.is_empty() {
            None
        } else {
            Some(normalize_version(&text))
        }
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        None
    }
}

fn is_music_island_exe(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.eq_ignore_ascii_case(ENTRY_EXE_NAME))
        .unwrap_or(false)
}

fn run_key_exe_path() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
        use winreg::RegKey;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let run = hkcu
            .open_subkey_with_flags(
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
                KEY_READ,
            )
            .ok()?;
        let value: String = run.get_value("Music Island").ok()?;
        parse_command_exe(&value)
    }
    #[cfg(not(windows))]
    {
        None
    }
}

fn parse_command_exe(command: &str) -> Option<PathBuf> {
    let trimmed = command.trim();
    if trimmed.starts_with('"') {
        let end = trimmed[1..].find('"')?;
        return Some(PathBuf::from(&trimmed[1..=end]));
    }
    let token = trimmed.split_whitespace().next()?;
    Some(PathBuf::from(token))
}

fn terminate_exe_at(path: &Path) {
    let target = normalize_path(path).to_ascii_lowercase();
    let mut system = sysinfo::System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    for (pid, process) in system.processes() {
        let Some(exe) = process.exe() else {
            continue;
        };
        if normalize_path(exe).to_ascii_lowercase() != target {
            continue;
        }
        crate::logging::append_event(&format!(
            "install: terminating older process pid={} path={}",
            pid.as_u32(),
            exe.display()
        ));
        let _ = process.kill();
    }
    thread::sleep(Duration::from_millis(500));
}

fn delete_exe_best_effort(path: &Path) {
    if !path.is_file() {
        return;
    }
    match fs::remove_file(path) {
        Ok(()) => crate::logging::append_event(&format!(
            "install: deleted obsolete exe {}",
            path.display()
        )),
        Err(error) => crate::logging::append_event(&format!(
            "install: failed to delete {}: {error}",
            path.display()
        )),
    }
    let old = path.with_extension("exe.old");
    let _ = fs::remove_file(old);
}

/// Compare this build against the AppData record + Run key target.
pub fn reconcile(current_version: &str) -> ReconcileResult {
    let Ok(current_exe) = std::env::current_exe() else {
        return ReconcileResult::Continue;
    };
    let current_exe = current_exe
        .canonicalize()
        .unwrap_or(current_exe);
    let current_version = normalize_version(current_version);

    let mut candidates: Vec<(PathBuf, String)> = Vec::new();

    if let Some(record) = load_record() {
        let path = PathBuf::from(&record.path);
        if path.is_file() && !paths_equal(&path, &current_exe) && is_music_island_exe(&path) {
            let ver = read_file_version(&path).unwrap_or(record.version);
            candidates.push((path, ver));
        }
    }

    if let Some(run_path) = run_key_exe_path() {
        if run_path.is_file()
            && !paths_equal(&run_path, &current_exe)
            && is_music_island_exe(&run_path)
            && !candidates.iter().any(|(p, _)| paths_equal(p, &run_path))
        {
            let ver = read_file_version(&run_path).unwrap_or_else(|| current_version.clone());
            candidates.push((run_path, ver));
        }
    }

    // Prefer deferring if any candidate is strictly newer.
    for (path, ver) in &candidates {
        if is_newer(ver, &current_version) {
            crate::logging::append_event(&format!(
                "install: this build v{current_version} is older than {} v{ver}",
                path.display()
            ));
            return ReconcileResult::DeferToNewer(NewerHandoff {
                path: normalize_path(path),
                version: ver.clone(),
            });
        }
    }

    // We are newest (or equal): retire older copies.
    for (path, ver) in &candidates {
        if is_newer(&current_version, ver) {
            crate::logging::append_event(&format!(
                "install: superseding older v{ver} at {}",
                path.display()
            ));
            terminate_exe_at(path);
            delete_exe_best_effort(path);
        } else if same_version(&current_version, ver) {
            crate::logging::append_event(&format!(
                "install: same version also at {} — keeping opened copy as canonical",
                path.display()
            ));
            // Do not delete same-version duplicates automatically (user choice UX later).
        }
    }

    if let Err(error) = save_record(&current_exe, &current_version) {
        crate::logging::append_event(&format!("install: failed to save record: {error}"));
    } else {
        crate::logging::append_event(&format!(
            "install: canonical v{current_version} => {}",
            current_exe.display()
        ));
    }

    ReconcileResult::Continue
}

pub fn open_path(path: &str) -> Result<(), String> {
    let path = PathBuf::from(path);
    if !path.is_file() {
        return Err("Newer build file is missing".into());
    }
    Command::new(&path)
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}
