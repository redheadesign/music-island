//! Voice runtime files are embedded in the binary and extracted once into AppData.
//! Users never need a `resources/` folder next to the portable exe.

use rust_embed::Embed;
use std::path::PathBuf;

#[derive(Embed)]
#[folder = "resources/voice/"]
struct VoiceAssets;

fn appdata_voice_dir() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Music Island")
        .join("voice")
}

/// Ensure DeepFilter / voice models exist under `%APPDATA%\Music Island\voice`.
/// VB-Cable is NOT embedded — users install it from the vendor site.
pub fn ensure_voice_resources() -> Result<PathBuf, String> {
    let dest = appdata_voice_dir();
    std::fs::create_dir_all(&dest).map_err(|e| format!("voice AppData: {e}"))?;

    for name in VoiceAssets::iter() {
        // Never ship / extract virtual-mic drivers inside the portable build.
        if name.as_ref().starts_with("vb-cable/") || name.as_ref().contains("vb-cable") {
            continue;
        }
        let Some(file) = VoiceAssets::get(name.as_ref()) else {
            continue;
        };
        let out = dest.join(name.as_ref());
        let expected = file.data.len() as u64;
        let up_to_date = out
            .metadata()
            .map(|m| m.len() == expected)
            .unwrap_or(false);
        if up_to_date {
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&out, file.data.as_ref()).map_err(|e| {
            format!("write {}: {e}", out.display())
        })?;
    }

    Ok(dest)
}
