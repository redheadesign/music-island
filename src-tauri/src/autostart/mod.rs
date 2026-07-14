use std::path::Path;

pub const STARTUP_ARG: &str = "--startup";
const ENTRY_NAME: &str = "Music Island";
const LEGACY_ENTRY_NAMES: [&str; 1] = ["music-island"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AutostartStatus {
    pub enabled: bool,
    pub entry_name: String,
    pub command: Option<String>,
    pub path_updated: bool,
}

impl AutostartStatus {
    fn disabled() -> Self {
        Self {
            enabled: false,
            entry_name: ENTRY_NAME.to_string(),
            command: None,
            path_updated: false,
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
    let path = exe_path.display().to_string();
    if needs_quotes(&path) {
        format!("\"{}\" {}", path, STARTUP_ARG)
    } else {
        format!("{} {}", path, STARTUP_ARG)
    }
}

fn needs_quotes(path: &str) -> bool {
    path.contains(' ') || path.contains('\t')
}

#[cfg(windows)]
mod windows {
    use super::{format_startup_command, AutostartStatus, ENTRY_NAME, LEGACY_ENTRY_NAMES};
    use std::env::current_exe;
    use std::path::PathBuf;
    use winreg::enums::RegType::REG_BINARY;
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};
    use winreg::{RegKey, RegValue};

    const RUN_KEY: &str = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run";
    const STARTUP_APPROVED_KEY: &str =
        "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run";
    const STARTUP_APPROVED_ENABLED: [u8; 12] = [
        0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];

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
        let command = format_startup_command(&exe);
        let previous = read_entry(ENTRY_NAME)?;
        let path_updated = previous.as_deref() != Some(command.as_str());
        write_entry(ENTRY_NAME, &command)?;
        Ok(AutostartStatus {
            enabled: true,
            entry_name: ENTRY_NAME.to_string(),
            command: Some(command),
            path_updated,
        })
    }

    fn disable_entries() -> Result<AutostartStatus, String> {
        delete_entry(ENTRY_NAME)?;
        cleanup_legacy_entries()?;
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
        Ok(canonical)
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
