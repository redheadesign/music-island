use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const GITHUB_OWNER: &str = "redheadesign";
const GITHUB_REPO: &str = "music-island";
const PREFERRED_ASSET: &str = "music-island.exe";
const CHECKSUM_ASSET: &str = "SHA256.txt";
const MAX_CHECKSUM_BYTES: usize = 64 * 1024;
const USER_AGENT: &str = "MusicIsland-Updater/2.0.0";
const TEMP_ROOT_NAME: &str = "MusicIslandUpdate";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub enabled: bool,
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub download_url: Option<String>,
    pub release_notes: Option<String>,
    pub message: String,
    #[serde(skip_serializing)]
    checksum_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgressEvent {
    pub phase: String,
    pub downloaded: u64,
    pub total: u64,
    pub percent: u8,
    pub message: String,
}

#[derive(Debug, serde::Deserialize)]
struct GhRelease {
    tag_name: String,
    body: Option<String>,
    assets: Vec<GhAsset>,
}

#[derive(Debug, serde::Deserialize)]
struct GhAsset {
    name: String,
    browser_download_url: String,
}

pub fn cleanup_stale_artifacts() {
    if let Ok(exe) = std::env::current_exe() {
        let old = sibling_with_suffix(&exe, ".old");
        let _ = fs::remove_file(&old);
        let bak = sibling_with_suffix(&exe, ".bak");
        let _ = fs::remove_file(&bak);
    }

    let temp_root = std::env::temp_dir().join(TEMP_ROOT_NAME);
    if temp_root.is_dir() {
        let _ = fs::remove_dir_all(&temp_root);
    }

    if let Ok(entries) = fs::read_dir(std::env::temp_dir()) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("music-island-finish-")
                && (name.ends_with(".cmd") || name.ends_with(".ps1"))
            {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
}

pub async fn check_for_updates(
    app: AppHandle,
    force_same_version: bool,
) -> anyhow::Result<UpdateCheckResult> {
    let current_version = app.package_info().version.to_string();
    emit_progress(&app, "checking", 0, 0, 0, "Checking GitHub Releases…");

    let client = http_client()?;
    let url = format!("https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest");
    let response = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| anyhow::anyhow!("GitHub request failed: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        anyhow::bail!("GitHub returned {status}: {body}");
    }

    let release: GhRelease = response
        .json()
        .await
        .map_err(|error| anyhow::anyhow!("Invalid GitHub release JSON: {error}"))?;

    let latest_version = normalize_version(&release.tag_name);
    let asset = pick_asset(&release.assets, PREFERRED_ASSET)
        .ok_or_else(|| anyhow::anyhow!("Latest release has no portable music-island.exe asset"))?;
    let checksum_asset = pick_asset(&release.assets, CHECKSUM_ASSET)
        .ok_or_else(|| anyhow::anyhow!("Latest release has no SHA256.txt checksum asset"))?;

    let newer = is_newer(&latest_version, &current_version);
    let same = latest_version == current_version;
    let has_update = newer || (force_same_version && same);
    let message = if newer {
        format!("Update available: v{latest_version}")
    } else if force_same_version && same {
        format!("Force reinstall enabled: v{latest_version}")
    } else {
        format!("You are on the latest version (v{current_version})")
    };

    emit_progress(
        &app,
        if has_update { "available" } else { "upToDate" },
        0,
        0,
        0,
        &message,
    );

    Ok(UpdateCheckResult {
        enabled: true,
        has_update,
        current_version,
        latest_version: Some(latest_version),
        download_url: Some(asset.browser_download_url.clone()),
        release_notes: release.body,
        message,
        checksum_url: Some(checksum_asset.browser_download_url.clone()),
    })
}

pub async fn download_and_install_update(
    app: AppHandle,
    force_same_version: bool,
) -> anyhow::Result<()> {
    let check = check_for_updates(app.clone(), force_same_version).await?;
    if !check.has_update {
        anyhow::bail!(check.message);
    }
    let download_url = check
        .download_url
        .ok_or_else(|| anyhow::anyhow!("Missing download URL"))?;
    let checksum_url = check
        .checksum_url
        .ok_or_else(|| anyhow::anyhow!("Missing checksum URL"))?;
    let latest = check
        .latest_version
        .unwrap_or_else(|| "unknown".to_string());

    let staging = staging_dir()?;
    let staged_exe = staging.join(PREFERRED_ASSET);

    let expected_sha256 = match download_checksum(&checksum_url).await {
        Ok(hash) => hash,
        Err(error) => {
            cleanup_path(&staging);
            return Err(error);
        }
    };

    if let Err(error) = download_exe(&app, &download_url, &staged_exe).await {
        cleanup_path(&staging);
        return Err(error);
    }
    if let Err(error) = verify_file_sha256(&staged_exe, &expected_sha256) {
        cleanup_path(&staging);
        return Err(error);
    }

    emit_progress(
        &app,
        "installing",
        0,
        0,
        100,
        "Preparing to replace portable exe…",
    );

    match apply_portable_replace(&app, &staged_exe, &latest) {
        Ok(()) => Ok(()),
        Err(error) => {
            cleanup_path(&staging);
            Err(error)
        }
    }
}

fn http_client() -> anyhow::Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|error| anyhow::anyhow!("HTTP client error: {error}"))
}

async fn download_checksum(url: &str) -> anyhow::Result<[u8; 32]> {
    let response = http_client()?
        .get(url)
        .send()
        .await
        .map_err(|error| anyhow::anyhow!("Checksum download failed: {error}"))?;
    if !response.status().is_success() {
        anyhow::bail!("Checksum download HTTP {}", response.status());
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_CHECKSUM_BYTES as u64)
    {
        anyhow::bail!("SHA256.txt is too large");
    }

    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| anyhow::anyhow!("Checksum download failed: {error}"))?;
        if bytes.len() + chunk.len() > MAX_CHECKSUM_BYTES {
            anyhow::bail!("SHA256.txt is too large");
        }
        bytes.extend_from_slice(&chunk);
    }
    let text = std::str::from_utf8(&bytes)
        .map_err(|_| anyhow::anyhow!("SHA256.txt is not valid UTF-8"))?;
    parse_sha256_file(text).map_err(anyhow::Error::msg)
}

async fn download_exe(app: &AppHandle, url: &str, dest: &Path) -> anyhow::Result<()> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    if dest.exists() {
        let _ = fs::remove_file(dest);
    }

    let client = http_client()?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| anyhow::anyhow!("Download failed to start: {error}"))?;

    if !response.status().is_success() {
        anyhow::bail!("Download HTTP {}", response.status());
    }

    let total = response.content_length().unwrap_or(0);
    emit_progress(app, "downloading", 0, total, 0, "Downloading update…");

    let mut file =
        File::create(dest).map_err(|error| anyhow::anyhow!("Cannot create temp file: {error}"))?;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_emit = 0u8;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| anyhow::anyhow!("Download interrupted: {error}"))?;
        file.write_all(&chunk)
            .map_err(|error| anyhow::anyhow!("Failed writing update file: {error}"))?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        let percent = if total > 0 {
            ((downloaded as f64 / total as f64) * 100.0).round() as u8
        } else {
            0
        };
        if percent != last_emit || downloaded == total {
            last_emit = percent;
            emit_progress(
                app,
                "downloading",
                downloaded,
                total,
                percent.min(100),
                &format!("Downloading… {percent}%"),
            );
        }
    }

    file.flush()?;
    drop(file);

    if !looks_like_pe(dest)? {
        let _ = fs::remove_file(dest);
        anyhow::bail!("Downloaded file is not a valid Windows executable");
    }

    if total > 0 && downloaded != total {
        let _ = fs::remove_file(dest);
        anyhow::bail!("Download incomplete ({downloaded} / {total} bytes)");
    }

    emit_progress(
        app,
        "downloaded",
        downloaded,
        total,
        100,
        "Download complete",
    );
    Ok(())
}

fn apply_portable_replace(app: &AppHandle, staged_exe: &Path, latest: &str) -> anyhow::Result<()> {
    let current = std::env::current_exe()
        .map_err(|error| anyhow::anyhow!("Cannot resolve current exe: {error}"))?;
    let current_dir = current
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Current exe has no parent directory"))?
        .to_path_buf();
    let old_path = sibling_with_suffix(&current, ".old");

    // Best effort: rename running image so the path is free for the new file.
    if old_path.exists() {
        let _ = fs::remove_file(&old_path);
    }
    fs::rename(&current, &old_path)
        .map_err(|error| anyhow::anyhow!("Cannot free current exe path for replace: {error}"))?;

    if let Err(error) = fs::copy(staged_exe, &current) {
        let _ = fs::rename(&old_path, &current);
        return Err(anyhow::anyhow!("Failed to place new exe: {error}"));
    }

    // Remove staging immediately so no leftover download folders remain.
    if let Some(parent) = staged_exe.parent() {
        cleanup_path(parent);
    }

    let pid = std::process::id();

    emit_progress(
        app,
        "restarting",
        0,
        0,
        100,
        &format!("Restarting into v{latest}…"),
    );

    #[cfg(windows)]
    {
        if let Err(error) = spawn_cleanup_helper(&current_dir, &current, &old_path, pid) {
            // New exe is already in place — try a direct relaunch fallback.
            let _ = std::process::Command::new(&current)
                .current_dir(&current_dir)
                .spawn();
            app.exit(0);
            return Err(anyhow::anyhow!(
                "Updater helper failed ({error}); attempted direct relaunch"
            ));
        }
    }

    #[cfg(not(windows))]
    {
        let _ = (current_dir, pid);
        anyhow::bail!("Portable self-update is only supported on Windows");
    }

    // Exit so the file lock drops; helper waits on PID then cleans .old.
    app.exit(0);
    Ok(())
}

/// Wait for this process to exit, delete leftovers, relaunch the new exe.
///
/// Uses PowerShell `-EncodedCommand` (UTF-16LE base64) so paths with non-ASCII
/// folders (e.g. Cyrillic `АТB`) survive. A `.cmd` helper written as UTF-8 is
/// misread by `cmd.exe` as OEM and breaks `start` with a "file not found" dialog.
#[cfg(windows)]
fn spawn_cleanup_helper(
    current_dir: &Path,
    new_exe: &Path,
    old_exe: &Path,
    pid: u32,
) -> anyhow::Result<()> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    fn ps_literal(path: &Path) -> String {
        path.to_string_lossy().replace('\'', "''")
    }

    let new_exe_s = ps_literal(new_exe);
    let old_exe_s = ps_literal(old_exe);
    let staging_s = ps_literal(&std::env::temp_dir().join(TEMP_ROOT_NAME));
    let cwd_s = ps_literal(current_dir);

    // Single-line script: EncodedCommand has a practical length limit; keep it short.
    let script = format!(
        "$ErrorActionPreference='SilentlyContinue'; \
$p={pid}; \
while (Get-Process -Id $p -ErrorAction SilentlyContinue) {{ Start-Sleep -Milliseconds 400 }}; \
if (Test-Path -LiteralPath '{old_exe_s}') {{ Remove-Item -LiteralPath '{old_exe_s}' -Force }}; \
if (Test-Path -LiteralPath '{staging_s}') {{ Remove-Item -LiteralPath '{staging_s}' -Recurse -Force }}; \
Start-Process -FilePath '{new_exe_s}' -WorkingDirectory '{cwd_s}'"
    );

    let encoded = STANDARD.encode(
        script
            .encode_utf16()
            .flat_map(|unit| unit.to_le_bytes())
            .collect::<Vec<u8>>(),
    );

    std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            &encoded,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|error| anyhow::anyhow!("Failed to spawn updater helper: {error}"))?;
    Ok(())
}

fn staging_dir() -> anyhow::Result<PathBuf> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dir = std::env::temp_dir()
        .join(TEMP_ROOT_NAME)
        .join(format!("dl-{stamp}"));
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn cleanup_path(path: &Path) {
    if path.is_dir() {
        let _ = fs::remove_dir_all(path);
    } else {
        let _ = fs::remove_file(path);
    }
}

fn sibling_with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "music-island.exe".into());
    name.push_str(suffix);
    path.with_file_name(name)
}

fn pick_asset<'a>(assets: &'a [GhAsset], exact_name: &str) -> Option<&'a GhAsset> {
    assets.iter().find(|asset| asset.name == exact_name)
}

fn parse_sha256_file(contents: &str) -> Result<[u8; 32], String> {
    for line in contents
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        let mut fields = line.split_whitespace();
        let Some(encoded_hash) = fields.next() else {
            continue;
        };
        let Some(file_name) = fields.next() else {
            continue;
        };
        if file_name.trim_start_matches('*') != PREFERRED_ASSET || fields.next().is_some() {
            continue;
        }
        return decode_sha256(encoded_hash);
    }
    Err(format!(
        "SHA256.txt has no checksum entry for {PREFERRED_ASSET}"
    ))
}

fn decode_sha256(encoded: &str) -> Result<[u8; 32], String> {
    if encoded.len() != 64 {
        return Err("SHA-256 checksum must contain exactly 64 hexadecimal characters".into());
    }
    let mut output = [0u8; 32];
    for (index, byte) in output.iter_mut().enumerate() {
        let offset = index * 2;
        *byte = u8::from_str_radix(&encoded[offset..offset + 2], 16)
            .map_err(|_| "SHA-256 checksum contains non-hexadecimal characters".to_string())?;
    }
    Ok(output)
}

fn verify_file_sha256(path: &Path, expected: &[u8; 32]) -> anyhow::Result<()> {
    let mut file = File::open(path).map_err(|error| {
        anyhow::anyhow!("Cannot open downloaded update for verification: {error}")
    })?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(|error| {
            anyhow::anyhow!("Cannot read downloaded update for verification: {error}")
        })?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    let actual = hasher.finalize();
    if actual.as_slice() != expected {
        anyhow::bail!("Downloaded update SHA-256 does not match SHA256.txt");
    }
    Ok(())
}

fn normalize_version(raw: &str) -> String {
    raw.trim()
        .trim_start_matches('v')
        .trim_start_matches('V')
        .to_string()
}

fn is_newer(latest: &str, current: &str) -> bool {
    match (parse_semver(latest), parse_semver(current)) {
        (Some(l), Some(c)) => l > c,
        _ => latest != current,
    }
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

fn looks_like_pe(path: &Path) -> anyhow::Result<bool> {
    let bytes = fs::read(path)?;
    Ok(bytes.len() > 64 && bytes[0] == b'M' && bytes[1] == b'Z')
}

fn emit_progress(
    app: &AppHandle,
    phase: &str,
    downloaded: u64,
    total: u64,
    percent: u8,
    message: &str,
) {
    let _ = app.emit(
        "updater:progress",
        UpdateProgressEvent {
            phase: phase.to_string(),
            downloaded,
            total,
            percent,
            message: message.to_string(),
        },
    );
    crate::logging::append_event(&format!("updater[{phase}]: {message}"));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asset(name: &str) -> GhAsset {
        GhAsset {
            name: name.to_string(),
            browser_download_url: format!("https://example.invalid/{name}"),
        }
    }

    #[test]
    fn asset_selection_requires_exact_release_names() {
        let assets = [
            asset("Music-Island.exe"),
            asset("setup.exe"),
            asset(PREFERRED_ASSET),
            asset("sha256.txt"),
            asset(CHECKSUM_ASSET),
        ];
        assert_eq!(
            pick_asset(&assets, PREFERRED_ASSET).unwrap().name,
            PREFERRED_ASSET
        );
        assert_eq!(
            pick_asset(&assets, CHECKSUM_ASSET).unwrap().name,
            CHECKSUM_ASSET
        );
        assert!(pick_asset(&assets, "MUSIC-ISLAND.EXE").is_none());
        assert!(pick_asset(&assets[..2], PREFERRED_ASSET).is_none());
    }

    #[test]
    fn checksum_parser_selects_only_the_portable_executable_entry() {
        let expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        let manifest = format!(
            "{}  setup.exe\n{} *{}\n",
            "0".repeat(64),
            expected.to_uppercase(),
            PREFERRED_ASSET
        );
        assert_eq!(
            parse_sha256_file(&manifest).unwrap(),
            decode_sha256(expected).unwrap()
        );
        assert!(parse_sha256_file(&format!("{expected}  Music-Island.exe\n")).is_err());
        assert!(parse_sha256_file("not-a-hash  music-island.exe\n").is_err());
    }

    #[test]
    fn file_verification_rejects_a_mismatched_digest() {
        let path = std::env::temp_dir().join(format!(
            "music-island-updater-hash-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::write(&path, b"abc").unwrap();
        let expected =
            decode_sha256("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
                .unwrap();
        assert!(verify_file_sha256(&path, &expected).is_ok());
        assert!(verify_file_sha256(&path, &[0; 32]).is_err());
        let _ = fs::remove_file(path);
    }
}
