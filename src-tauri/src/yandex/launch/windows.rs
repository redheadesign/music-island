use super::{plain_path, same_path, tokens, Backend, Entry, Location};
use anyhow::{bail, Context, Result};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
use windows::{
    core::{Interface, PCWSTR},
    Win32::{
        Foundation::RPC_E_CHANGED_MODE,
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IPersistFile,
            CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READ,
        },
        UI::Shell::{
            FOLDERID_Desktop, FOLDERID_Programs, FOLDERID_Startup, IShellLinkW,
            SHGetKnownFolderPath, ShellLink, KF_FLAG_DEFAULT,
        },
    },
};
use winreg::{
    enums::{RegType::REG_SZ, HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE},
    RegKey,
};

const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";

pub(super) struct WindowsBackend {
    roots: Vec<PathBuf>,
    menu_root: PathBuf,
    install: PathBuf,
    run_key: String,
    _apartment: Apartment,
}

struct Apartment(bool);
impl Apartment {
    fn new() -> Result<Self> {
        let result = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
        if result == RPC_E_CHANGED_MODE {
            return Ok(Self(false));
        }
        result.ok()?;
        Ok(Self(true))
    }
}
impl Drop for Apartment {
    fn drop(&mut self) {
        if self.0 {
            unsafe {
                CoUninitialize();
            }
        }
    }
}

fn known_folder(id: &windows::core::GUID) -> Result<PathBuf> {
    unsafe {
        let ptr = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None)?;
        let path = ptr.to_string();
        CoTaskMemFree(Some(ptr.0.cast()));
        Ok(PathBuf::from(path?))
    }
}

impl WindowsBackend {
    pub(super) fn new() -> Result<Self> {
        let apartment = Apartment::new()?;
        let appdata = std::env::var_os("APPDATA").context("APPDATA is unavailable")?;
        let local = std::env::var_os("LOCALAPPDATA").context("LOCALAPPDATA is unavailable")?;
        let menu_root = known_folder(&FOLDERID_Programs)?;
        Ok(Self {
            roots: vec![
                known_folder(&FOLDERID_Desktop)?,
                menu_root.clone(),
                known_folder(&FOLDERID_Startup)?,
                PathBuf::from(appdata)
                    .join(r"Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"),
            ],
            install: PathBuf::from(local).join(r"Programs\YandexMusic"),
            menu_root,
            run_key: RUN_KEY.into(),
            _apartment: apartment,
        })
    }

    fn valid_executable(&self, path: &Path) -> bool {
        path.parent()
            .is_some_and(|parent| same_path(parent, &self.install))
            && path.file_name().is_some_and(|name| {
                let name = name.to_string_lossy().to_lowercase();
                name == "яндекс музыка.exe" || name == "yandex music.exe"
            })
    }

    fn validate_location(&self, location: &Location) -> Result<()> {
        match location {
            Location::Shortcut(path) => {
                if path
                    .components()
                    .any(|part| matches!(part, std::path::Component::ParentDir))
                    || !path
                        .extension()
                        .is_some_and(|ext| ext.to_string_lossy().eq_ignore_ascii_case("lnk"))
                    || !self.roots.iter().any(|root| path.starts_with(root))
                {
                    bail!("Shortcut is outside the user's supported launch locations");
                }
                if path.exists() {
                    plain_path(path)?;
                }
            }
            Location::Run(name) if name.is_empty() || name.contains('\0') => {
                bail!("Invalid startup entry name")
            }
            Location::Run(_) => {}
        }
        Ok(())
    }

    fn open_link(&self, path: &Path) -> Result<IShellLinkW> {
        plain_path(path)?;
        unsafe {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
            let persist: IPersistFile = link.cast()?;
            persist.Load(PCWSTR(wide(path.as_os_str()).as_ptr()), STGM_READ)?;
            Ok(link)
        }
    }

    fn link_values(link: &IShellLinkW) -> Result<(PathBuf, String)> {
        let mut target = vec![0; 32768];
        let mut args = vec![0; 32768];
        unsafe {
            // Shell links can store %LOCALAPPDATA% instead of a literal path.
            // Request the filesystem target before matching the installed player.
            link.GetPath(&mut target, std::ptr::null_mut(), 0)?;
            link.GetArguments(&mut args)?;
        }
        let decode = |value: &[u16]| -> Result<String> {
            let end = value
                .iter()
                .position(|c| *c == 0)
                .context("Shortcut property is too long")?;
            Ok(String::from_utf16(&value[..end])?)
        };
        Ok((PathBuf::from(decode(&target)?), decode(&args)?))
    }

    fn command_target(command: &str) -> Result<PathBuf> {
        let parsed = tokens(command)?;
        Ok(PathBuf::from(
            &parsed.first().context("Empty startup command")?.1,
        ))
    }

    fn collect_links(&self, root: &Path, depth: usize, files: &mut Vec<PathBuf>) -> Result<()> {
        if !root.exists() {
            return Ok(());
        }
        plain_path(root)?;
        if depth > 8 || files.len() > 4096 {
            bail!("Too many shortcuts to inspect safely");
        }
        for item in fs::read_dir(root)? {
            if files.len() >= 4096 {
                bail!("Too many shortcuts to inspect safely");
            }
            let item = item?;
            let path = item.path();
            if plain_path(&path).is_err() {
                continue;
            }
            if item.file_type()?.is_dir() {
                // Only Start menu groups are recursive; Desktop folders may contain entire projects.
                if path.starts_with(&self.menu_root) {
                    self.collect_links(&path, depth + 1, files)?;
                }
            } else if path
                .extension()
                .is_some_and(|ext| ext.to_string_lossy().eq_ignore_ascii_case("lnk"))
            {
                files.push(path);
            }
        }
        Ok(())
    }
}

impl Backend for WindowsBackend {
    fn discover(&self, executable: &Path) -> Result<Vec<(Location, String)>> {
        if !self.valid_executable(executable) {
            bail!("Unsupported Yandex Music installation path");
        }
        plain_path(executable)?;
        let mut files = Vec::new();
        for root in &self.roots {
            self.collect_links(root, 0, &mut files)?;
        }
        files.sort();
        files.dedup();
        let mut candidates = Vec::new();
        for path in files {
            let location = Location::Shortcut(path);
            // Unrelated, broken and advertised shortcuts are not launch candidates.
            if let Ok(Some((target, args))) = self.read(&location) {
                if same_path(&target, executable) {
                    candidates.push((location, args));
                }
            }
        }
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        match hkcu.open_subkey_with_flags(&self.run_key, KEY_READ) {
            Ok(run) => {
                for value in run.enum_values() {
                    let (name, value) = value?;
                    if value.vtype != REG_SZ {
                        continue;
                    }
                    let command: String = run.get_value(&name)?;
                    if Self::command_target(&command)
                        .is_ok_and(|target| same_path(&target, executable))
                    {
                        candidates.push((Location::Run(name), command));
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        Ok(candidates)
    }

    fn read(&self, location: &Location) -> Result<Option<(PathBuf, String)>> {
        self.validate_location(location)?;
        match location {
            Location::Shortcut(path) => {
                if !path.exists() {
                    return Ok(None);
                }
                Ok(Some(Self::link_values(&self.open_link(path)?)?))
            }
            Location::Run(name) => {
                let run = match RegKey::predef(HKEY_CURRENT_USER)
                    .open_subkey_with_flags(&self.run_key, KEY_READ)
                {
                    Ok(run) => run,
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
                    Err(error) => return Err(error.into()),
                };
                let value = match run.get_raw_value(name) {
                    Ok(value) => value,
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
                    Err(error) => return Err(error.into()),
                };
                if value.vtype != REG_SZ {
                    bail!("Yandex startup entry type was changed");
                }
                let command: String = run.get_value(name)?;
                Ok(Some((Self::command_target(&command)?, command)))
            }
        }
    }

    fn write(&self, entry: &Entry, expected: &str, value: &str) -> Result<()> {
        self.validate_location(&entry.location)?;
        if !self.valid_executable(&entry.executable) {
            bail!("Invalid backed-up Yandex executable");
        }
        let Some((target, current)) = self.read(&entry.location)? else {
            bail!("Launch entry disappeared");
        };
        if !same_path(&target, &entry.executable) || current != expected {
            bail!("Launch entry changed during configuration; retry without overwriting it");
        }
        match &entry.location {
            Location::Run(name) => {
                if !same_path(&Self::command_target(value)?, &entry.executable) {
                    bail!("Refusing to replace the startup executable");
                }
                let run = RegKey::predef(HKEY_CURRENT_USER)
                    .open_subkey_with_flags(&self.run_key, KEY_READ | KEY_SET_VALUE)?;
                if run.get_raw_value(name)?.vtype != REG_SZ
                    || run.get_value::<String, _>(name)? != expected
                {
                    bail!("Startup entry changed before saving");
                }
                run.set_value(name, &value)?;
            }
            Location::Shortcut(path) => {
                let original_bytes = fs::read(path)?;
                let link = self.open_link(path)?;
                let (target, args) = Self::link_values(&link)?;
                if !same_path(&target, &entry.executable) || args != expected {
                    bail!("Shortcut arguments changed");
                }
                static SEQUENCE: AtomicU64 = AtomicU64::new(0);
                let temp = path.with_file_name(format!(
                    ".music-island-{}-{}-{}.lnk",
                    std::process::id(),
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)?
                        .as_nanos(),
                    SEQUENCE.fetch_add(1, Ordering::Relaxed)
                ));
                let handle = fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&temp)?;
                drop(handle);
                let result = (|| -> Result<()> {
                    unsafe {
                        link.SetArguments(PCWSTR(wide(std::ffi::OsStr::new(value)).as_ptr()))?;
                        let persist: IPersistFile = link.cast()?;
                        persist.Save(PCWSTR(wide(temp.as_os_str()).as_ptr()), false)?;
                    }
                    if fs::read(path)? != original_bytes {
                        bail!("Shortcut changed before saving");
                    }
                    handy_core::embedded_assets::atomic_write(path, &fs::read(&temp)?)
                })();
                let _ = fs::remove_file(&temp);
                result?;
            }
        }
        Ok(())
    }
}

fn wide(value: &std::ffi::OsStr) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    value.encode_wide().chain(Some(0)).collect()
}

#[cfg(test)]
mod tests;
