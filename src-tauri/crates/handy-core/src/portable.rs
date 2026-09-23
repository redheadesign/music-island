use rust_embed::Embed;
use std::path::PathBuf;
use std::sync::OnceLock;
static DATA: OnceLock<PathBuf> = OnceLock::new();
#[derive(Embed)]
#[folder = "resources/"]
struct Assets;
pub fn init() {
    crate::storage::remember_hf();
    let root = data_dir().unwrap();
    std::env::set_var("HF_HOME", root.join("huggingface"));
    std::env::set_var("HF_HUB_CACHE", root.join("huggingface/hub"));
}
pub fn data_dir() -> Option<&'static PathBuf> {
    Some(DATA.get_or_init(|| {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .expect("APPDATA unavailable")
            .join("Music Island")
            .join("dictation")
    }))
}
pub fn is_portable() -> bool {
    true
}
pub fn app_data_dir(_: &tauri::AppHandle) -> Result<PathBuf, tauri::Error> {
    Ok(data_dir().unwrap().clone())
}
pub fn app_log_dir(_: &tauri::AppHandle) -> Result<PathBuf, tauri::Error> {
    Ok(data_dir().unwrap().join("logs"))
}
pub fn resolve_app_data(app: &tauri::AppHandle, relative: &str) -> Result<PathBuf, tauri::Error> {
    Ok(app_data_dir(app)?.join(relative))
}
pub fn store_path(relative: &str) -> PathBuf {
    data_dir().unwrap().join(relative)
}
pub fn resources() -> PathBuf {
    data_dir().unwrap().join("runtime").join("handy-0.9.7")
}
pub fn extract_resources() -> std::io::Result<()> {
    use sha2::{Digest, Sha256};
    for name in Assets::iter() {
        let file = Assets::get(name.as_ref()).unwrap();
        let path = resources().join("resources").join(name.as_ref());
        crate::runtime::checked_directory(path.parent().unwrap()).map_err(std::io::Error::other)?;
        if let Ok(meta) = std::fs::symlink_metadata(&path) {
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if meta.file_attributes() & 0x400 != 0 {
                    return Err(std::io::Error::other(
                        "Resource must not be a reparse point",
                    ));
                }
            }
            if !meta.is_file() {
                return Err(std::io::Error::other("Invalid resource file"));
            }
        }
        if std::fs::read(&path)
            .is_ok_and(|bytes| Sha256::digest(&bytes) == Sha256::digest(file.data.as_ref()))
        {
            continue;
        }
        let partial = path.with_extension(format!(
            "{}-{}.extracting",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(std::io::Error::other)?
                .as_nanos()
        ));
        {
            use std::io::Write;
            let mut output = std::fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&partial)?;
            output.write_all(file.data.as_ref())?;
            output.sync_all()?;
        }
        std::fs::rename(partial, path)?;
    }
    Ok(())
}

pub fn prepare_storage() -> anyhow::Result<()> {
    let root = data_dir().unwrap();
    crate::runtime::checked_directory(root)?;
    for folder in [
        "models",
        "huggingface",
        "huggingface/hub",
        "history",
        "recordings",
        "downloads",
        "runtime",
        "logs",
    ] {
        crate::runtime::checked_directory(&root.join(folder))?;
    }
    Ok(())
}
