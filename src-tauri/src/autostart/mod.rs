use std::path::Path;

pub const STARTUP_ARG: &str = "--startup";
const ENTRY_NAME: &str = "Music Island";
const LEGACY_ENTRY_NAMES: [&str; 1] = ["music-island"];
const STARTUP_SHORTCUT_NAME: &str = "Music Island.lnk";

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutostartStatus {
    pub enabled: bool,
    pub entry_name: String,
    pub command: Option<String>,
    pub exe_path: Option<String>,
    pub path_updated: bool,
    pub shortcut_path: Option<String>,
}

impl AutostartStatus {
    fn disabled() -> Self {
        Self {
            enabled: false,
            entry_name: ENTRY_NAME.to_string(),
            command: None,
            exe_path: None,
            path_updated: false,
            shortcut_path: None,
        }
    }
}

pub fn sync(enabled: bool) -> Result<AutostartStatus, String> {
    #[cfg(windows)]
    {
        return windows::sync(enabled);
    }

    #[cfg(not(windows))]
    {
        let _ = enabled;
        Ok(AutostartStatus::disabled())
    }
}

pub fn format_startup_command(exe_path: &Path) -> String {
    let path = normalize_path_display(exe_path);
    if needs_quotes(&path) {
        format!("\"{}\" {}", path, STARTUP_ARG)
    } else {
        format!("{} {}", path, STARTUP_ARG)
    }
}

fn normalize_path_display(path: &Path) -> String {
    let raw = path.display().to_string();
    raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_string()
}

fn needs_quotes(path: &str) -> bool {
    path.contains(' ') || path.contains('\t')
}

#[cfg(windows)]
mod windows {
    use super::{
        format_startup_command, normalize_path_display, AutostartStatus, ENTRY_NAME,
        LEGACY_ENTRY_NAMES, STARTUP_ARG, STARTUP_SHORTCUT_NAME,
    };
    use std::env::current_exe;
    use std::fs;
    use std::os::windows::process::CommandExt;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use winreg::enums::RegType::REG_BINARY;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};
    use winreg::{RegKey, RegValue};

    const RUN_KEY: &str = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run";
    const STARTUP_APPROVED_KEY: &str =
        "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run";
    const STARTUP_APPROVED_ENABLED: [u8; 12] = [
        0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    pub fn sync(enabled: bool) -> Result<AutostartStatus, String> {
        cleanup_legacy_entries()?;

        if enabled {
            enable_current_exe()
        } else {
            disable_entries()
        }
    }

    fn enable_current_exe() -> Result<AutostartStatus, String> {
        let exe = resolve_exe_path()?;
        let exe_path = normalize_path_display(&exe);
        let command = format_startup_command(&exe);
        let previous = read_entry(ENTRY_NAME)?;
        let path_updated = previous.as_deref() != Some(command.as_str());
        if path_updated {
            write_entry(ENTRY_NAME, &command)?;
        }

        let shortcut_path = startup_shortcut_path()?;
        let need_shortcut = path_updated || !shortcut_path.is_file();
        if need_shortcut {
            write_startup_shortcut(&exe)?;
        }

        Ok(AutostartStatus {
            enabled: true,
            entry_name: ENTRY_NAME.to_string(),
            command: Some(command),
            exe_path: Some(exe_path),
            path_updated: path_updated || need_shortcut,
            shortcut_path: Some(shortcut_path.display().to_string()),
        })
    }

    fn disable_entries() -> Result<AutostartStatus, String> {
        delete_entry(ENTRY_NAME)?;
        cleanup_legacy_entries()?;
        let _ = delete_startup_shortcut();
        Ok(AutostartStatus::disabled())
    }

    fn cleanup_legacy_entries() -> Result<(), String> {
        for name in LEGACY_ENTRY_NAMES {
            if name != ENTRY_NAME {
                let _ = delete_entry(name);
            }
        }
        Ok(())
    }

    fn resolve_exe_path() -> Result<PathBuf, String> {
        let exe = current_exe().map_err(|error| error.to_string())?;
        let canonical = exe
            .canonicalize()
            .map_err(|error| format!("failed to resolve executable path: {error}"))?;
        if !canonical.is_file() {
            return Err(format!(
                "executable path does not exist: {}",
                canonical.display()
            ));
        }
        Ok(PathBuf::from(normalize_path_display(&canonical)))
    }

    fn startup_dir() -> Result<PathBuf, String> {
        let appdata = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .ok_or_else(|| "APPDATA is not set".to_string())?;
        Ok(appdata.join(r"Microsoft\Windows\Start Menu\Programs\Startup"))
    }

    fn startup_shortcut_path() -> Result<PathBuf, String> {
        Ok(startup_dir()?.join(STARTUP_SHORTCUT_NAME))
    }

    fn write_startup_shortcut(exe: &Path) -> Result<PathBuf, String> {
        let dir = startup_dir()?;
        fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
        let shortcut = startup_shortcut_path()?;
        let target = normalize_path_display(exe);
        let working_dir = exe.parent().map(normalize_path_display).unwrap_or_default();
        let shortcut_display = shortcut.display().to_string();
        let script = format!(
            "$ws = New-Object -ComObject WScript.Shell; \
             $s = $ws.CreateShortcut('{shortcut}'); \
             $s.TargetPath = '{target}'; \
             $s.Arguments = '{args}'; \
             $s.WorkingDirectory = '{cwd}'; \
             $s.WindowStyle = 7; \
             $s.Save();",
            shortcut = escape_ps(&shortcut_display),
            target = escape_ps(&target),
            args = escape_ps(STARTUP_ARG),
            cwd = escape_ps(&working_dir),
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
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|error| format!("failed to create startup shortcut: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("failed to create startup shortcut: {stderr}"));
        }
        if !shortcut.is_file() {
            return Err("startup shortcut was not created".into());
        }
        Ok(shortcut)
    }

    fn delete_startup_shortcut() -> Result<(), String> {
        let shortcut = startup_shortcut_path()?;
        match fs::remove_file(&shortcut) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }

    fn escape_ps(value: &str) -> String {
        value.replace('\'', "''")
    }

    fn read_entry(name: &str) -> Result<Option<String>, String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let run = hkcu
            .open_subkey_with_flags(RUN_KEY, KEY_READ)
            .map_err(|error| error.to_string())?;
        match run.get_value::<String, _>(name) {
            Ok(value) => Ok(Some(value)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }

    fn write_entry(name: &str, command: &str) -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        hkcu.open_subkey_with_flags(RUN_KEY, KEY_SET_VALUE)
            .map_err(|error| error.to_string())?
            .set_value(name, &command)
            .map_err(|error| error.to_string())?;

        if let Ok(approved) = hkcu.open_subkey_with_flags(STARTUP_APPROVED_KEY, KEY_SET_VALUE) {
            let _ = approved.set_raw_value(
                name,
                &RegValue {
                    vtype: REG_BINARY,
                    bytes: STARTUP_APPROVED_ENABLED.to_vec(),
                },
            );
        }

        Ok(())
    }

    fn delete_entry(name: &str) -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let run = hkcu
            .open_subkey_with_flags(RUN_KEY, KEY_SET_VALUE)
            .map_err(|error| error.to_string())?;
        match run.delete_value(name) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }

    #[cfg(test)]
    mod tests {
        use super::super::format_startup_command;
        use std::path::Path;

        #[test]
        fn quotes_paths_with_spaces_for_portable_distribution() {
            let command =
                format_startup_command(Path::new(r"C:\Tools\Music Island\music-island.exe"));
            assert_eq!(
                command,
                r#""C:\Tools\Music Island\music-island.exe" --startup"#
            );
        }

        #[test]
        fn keeps_simple_paths_unquoted() {
            let command = format_startup_command(Path::new(r"C:\Tools\music-island.exe"));
            assert_eq!(command, r"C:\Tools\music-island.exe --startup");
        }
    }
}
