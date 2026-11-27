use super::download::{HttpDownloadEvent, HttpDownloadOutcome};
use super::{DownloadCleanup, DownloadProgress, EngineType, ModelInfo, ModelManager, ModelSource};
use anyhow::{ensure, Context, Result};
use hf_hub::api::tokio::CancellationToken;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::Emitter;

const V4: &str = "gigaam-v4-rnnt";
const V4_COMPACT: &str = "gigaam-v4-rnnt-compact";

#[derive(Clone, Deserialize)]
struct PackFile {
    name: String,
    url: String,
    size: u64,
    sha256: String,
}

#[derive(Clone, Deserialize)]
pub(super) struct Pack {
    pub(super) id: String,
    name: String,
    languages: Vec<String>,
    streaming: bool,
    files: Vec<PackFile>,
}

pub(super) fn catalog() -> &'static [Pack] {
    static PACKS: OnceLock<Vec<Pack>> = OnceLock::new();
    PACKS.get_or_init(|| {
        let mut packs: Vec<Pack> = serde_json::from_str(include_str!(
            "../../catalog/gigaam-packs.json"
        )).expect("invalid bundled GigaAM package catalog");
        let offline_files: Vec<&str> = serde_json::from_str(include_str!(
            "../../catalog/gigaam-v4-compact-files.json"
        )).expect("invalid compact GigaAM file list");
        let mut compact = packs.iter().find(|pack| pack.id == V4)
            .expect("missing GigaAM-v4").clone();
        compact.id = V4_COMPACT.into();
        compact.streaming = false;
        compact.files.retain(|file| offline_files.contains(&file.name.as_str()));
        assert_eq!(compact.files.len(), offline_files.len(), "missing compact GigaAM files");
        packs.push(compact);
        packs
    })
}

pub(super) fn find(id: &str) -> Option<&'static Pack> {
    catalog().iter().find(|pack| pack.id == id)
}

impl Pack {
    fn installed_sibling(&self, root: &Path) -> Option<PathBuf> {
        let sibling = find(match self.id.as_str() {
            V4 => V4_COMPACT,
            V4_COMPACT => V4,
            _ => return None,
        })?;
        let path = root.join(&sibling.id);
        sibling.is_installed(&path).then_some(path)
    }

    fn size(&self) -> u64 {
        self.files.iter().map(|file| file.size).sum()
    }

    fn staging(&self, models_dir: &Path) -> PathBuf {
        models_dir.join(format!("{}.installing", self.id))
    }

    fn previous(&self, models_dir: &Path) -> PathBuf {
        models_dir.join(format!("{}.previous", self.id))
    }

    pub(super) fn recover(&self, root: &Path) -> Result<()> {
        let previous = self.previous(root);
        if previous.exists() {
            let target = root.join(&self.id);
            if !target.exists() {
                fs::rename(previous, target)?;
            } else if self.is_installed(&target) {
                Self::clean_backup(&previous);
            }
        }
        Ok(())
    }

    fn clean_backup(path: &Path) {
        if path.exists() {
            if let Err(error) = fs::remove_dir_all(path) {
                log::warn!(
                    "Could not clean replaced GigaAM package {}: {error}",
                    path.display()
                );
            }
        }
    }

    fn install(&self, root: &Path) -> Result<()> {
        let staging = self.staging(root);
        let target = root.join(&self.id);
        let previous = self.previous(root);
        self.recover(root)?;
        // A stale backup can coexist with a subsequently truncated new pack.
        // Preserve it until the fully verified staging directory is in place.
        let displaced = if previous.exists() {
            root.join(format!("{}.damaged", self.id))
        } else {
            previous.clone()
        };
        if displaced.exists() {
            fs::remove_dir_all(&displaced)?;
        }
        let replacing = target.exists();
        if replacing {
            fs::rename(&target, &displaced)?;
        }
        if let Err(promote_error) = fs::rename(staging, &target) {
            if replacing {
                fs::rename(&displaced, &target).with_context(|| {
                    format!(
                        "Could not restore {} after {promote_error}",
                        displaced.display()
                    )
                })?;
            }
            return Err(promote_error.into());
        }
        Self::clean_backup(&displaced);
        Self::clean_backup(&previous);
        Ok(())
    }

    pub(super) fn is_installed(&self, dir: &Path) -> bool {
        fs::read(dir.join(".verified")).is_ok_and(|bytes| bytes == self.receipt())
            && self.files.iter().all(|file| {
                fs::symlink_metadata(dir.join(&file.name))
                    .is_ok_and(|stat| stat.is_file() && stat.len() == file.size)
            })
    }

    fn receipt(&self) -> Vec<u8> {
        let mut digest = Sha256::new();
        for file in &self.files {
            digest.update(file.name.as_bytes());
            digest.update([0]);
            digest.update(file.sha256.as_bytes());
        }
        digest.finalize().to_vec()
    }

    pub(super) fn partial_size(&self, models_dir: &Path) -> u64 {
        let staging = self.staging(models_dir);
        self.files
            .iter()
            .filter_map(|file| {
                fs::symlink_metadata(staging.join(&file.name))
                    .ok()
                    .filter(|stat| stat.is_file())
                    .map(|stat| stat.len().min(file.size))
            })
            .sum()
    }

    pub(super) fn remove(&self, root: &Path) -> Result<()> {
        for dir in [
            root.join(&self.id),
            self.staging(root),
            self.previous(root),
            root.join(format!("{}.damaged", self.id)),
        ] {
            if dir.exists() {
                fs::remove_dir_all(dir)?;
            }
        }
        Ok(())
    }

    pub(super) fn model_info(&self) -> ModelInfo {
        ModelInfo {
            id: self.id.clone(),
            name: self.name.clone(),
            description: "Local speech recognition with punctuation and number formatting".into(),
            filename: self.id.clone(),
            source: ModelSource::GigaAMFiles,
            size_mb: self.size().div_ceil(1024 * 1024),
            size_bytes: Some(self.size()),
            is_downloaded: false,
            is_downloading: false,
            partial_size: 0,
            is_directory: true,
            engine_type: if self.streaming {
                EngineType::GigaAMZapformer
            } else {
                EngineType::GigaAMZapformerCompact
            },
            accuracy_score: 0.0,
            speed_score: 0.0,
            supports_translation: false,
            is_recommended: false,
            supported_languages: self.languages.clone(),
            supports_language_selection: self.id == "gigaam-multilingual-v2-rnnt",
            is_custom: false,
            supports_background_recognition: false,
            supports_streaming: self.streaming,
            supports_language_detection: true,
        }
    }
}

// A sibling install can be deleted while this download is running. Once the
// staging link (or copy) exists it has an independent lifetime. Keep existing
// partial downloads for the resumable transport and verify every adopted file.
impl PackFile {
    async fn reuse(
        &self,
        model_id: &str,
        sibling: &Path,
        destination: &Path,
        temporary: &Path,
        emit: &(dyn Fn(HttpDownloadEvent<'_>) + Send + Sync),
    ) -> Result<bool> {
        if fs::symlink_metadata(destination).is_ok() {
            return Ok(false);
        }
        let source = sibling.join(&self.name);
        if !fs::symlink_metadata(&source).is_ok_and(|stat| stat.is_file() && stat.len() == self.size) {
            return Ok(false);
        }
        if let Err(error) = fs::hard_link(&source, temporary) {
            log::debug!("Copying {} because a hard link is unavailable: {error}", self.name);
            let new_file = temporary.to_owned();
            let copied = tokio::task::spawn_blocking(move || {
                let mut input = fs::File::open(source)?;
                let mut output = fs::File::create_new(new_file)?;
                std::io::copy(&mut input, &mut output)
            }).await?;
            if let Err(copy_error) = copied {
                log::debug!("Could not copy {}: {copy_error}", self.name);
                if temporary.exists() { fs::remove_file(temporary)?; }
                return Ok(false);
            }
        }
        if ModelManager::verify_file_with_events(model_id, temporary, Some(&self.sha256), emit)
            .await.is_err()
        {
            if temporary.exists() {
                fs::remove_file(temporary)?;
            }
            return Ok(false);
        }
        fs::rename(temporary, destination)?;
        Ok(true)
    }
}

impl ModelManager {
    pub(super) async fn download_gigaam_pack(&self, id: &str) -> Result<()> {
        let pack = find(id).context("Unknown GigaAM package")?;
        let target = self.models_dir.join(&pack.id);
        let token = CancellationToken::new();
        {
            let mut flags = self.cancel_flags.lock().unwrap();
            ensure!(
                !flags.contains_key(id),
                "A download of this model is already running"
            );
            if pack.is_installed(&target) {
                return Ok(());
            }
            flags.insert(id.to_owned(), token.clone());
        }
        let cleanup = DownloadCleanup {
            available_models: &self.available_models,
            cancel_flags: &self.cancel_flags,
            model_id: id.to_owned(),
            disarmed: false,
        };
        let staging = pack.staging(&self.models_dir);
        fs::create_dir_all(&staging)?;
        let temporary = staging.join(".reusing");
        if temporary.exists() {
            fs::remove_file(&temporary)?;
        }
        let sibling = pack.installed_sibling(&self.models_dir);
        if let Some(info) = self.available_models.lock().unwrap().get_mut(id) {
            info.is_downloading = true;
        }
        let total = pack.size();
        let mut finished = 0;
        for file in &pack.files {
            if token.is_cancelled() {
                return Ok(());
            }
            let handle = &self.app_handle;
            let emit = |event: HttpDownloadEvent<'_>| match event {
                HttpDownloadEvent::Progress(progress) => {
                    let downloaded = finished + progress.downloaded.min(file.size);
                    let _ = handle.emit(
                        "model-download-progress",
                        DownloadProgress {
                            model_id: id.into(),
                            downloaded,
                            total,
                            percentage: 100.0 * downloaded as f64 / total as f64,
                        },
                    );
                }
                HttpDownloadEvent::VerificationStarted => {
                    let _ = handle.emit("model-verification-started", id);
                }
                HttpDownloadEvent::VerificationCompleted => {
                    let _ = handle.emit("model-verification-completed", id);
                }
            };
            let destination = staging.join(&file.name);
            let reused = match &sibling {
                Some(path) => file.reuse(id, path, &destination, &temporary, &emit).await?,
                None => false,
            };
            if !reused {
                let result = Self::download_http_resumable_with_events(
                    id, &file.url, &destination, Some(file.size), Some(&file.sha256), &token, &emit,
                )
                .await
                .with_context(|| format!("Downloading {}", file.name))?;
                if matches!(result, HttpDownloadOutcome::Cancelled) {
                    return Ok(());
                }
            }
            finished += file.size;
            let _ = self.app_handle.emit(
                "model-download-progress",
                DownloadProgress {
                    model_id: id.into(),
                    downloaded: finished,
                    total,
                    percentage: 100.0 * finished as f64 / total as f64,
                },
            );
        }
        if token.is_cancelled() {
            return Ok(());
        }
        fs::write(staging.join(".verified"), pack.receipt())?;
        pack.install(&self.models_dir)?;
        drop(cleanup);
        self.update_download_status()?;
        let _ = self.app_handle.emit("model-download-complete", id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_pins_both_packs_and_their_explicit_languages() {
        let bilingual = find("gigaam-v4-rnnt").unwrap();
        assert_eq!(bilingual.languages, ["ru", "en"]);
        assert!(!bilingual.model_info().supports_language_selection);
        let multilingual = find("gigaam-multilingual-v2-rnnt").unwrap();
        assert_eq!(multilingual.languages.len(), 21);
        assert!(multilingual.model_info().supports_language_selection);
        for pack in [bilingual, multilingual] {
            let mut names = std::collections::HashSet::new();
            assert!(pack.model_info().supports_streaming);
            for file in &pack.files {
                assert_eq!(
                    Path::new(&file.name).file_name().unwrap(),
                    file.name.as_str()
                );
                assert!(names.insert(file.name.as_str()));
                assert!(file.size > 0);
                assert!(file.url.starts_with("https://"));
                assert_eq!(file.sha256.len(), 64);
                assert!(file.sha256.bytes().all(|b| b.is_ascii_hexdigit()));
            }
            assert!(names.contains("island-gigaam.json") && names.contains("streaming.json"));
        }
    }

    fn fixture() -> Pack {
        Pack {
            id: "test-model".into(),
            name: "Test".into(),
            languages: vec!["en".into()],
            streaming: false,
            files: vec![PackFile {
                name: "encoder".into(),
                url: "fixture".into(),
                size: 3,
                sha256: "fixture".into(),
            }],
        }
    }

    #[test]
    fn compact_v4_uses_the_verified_offline_subset() {
        let compact = find(V4_COMPACT).unwrap();
        let full = find(V4).unwrap();
        assert_eq!(compact.name, full.name);
        assert_eq!(compact.languages, full.languages);
        assert_eq!(compact.files.len(), 9);
        assert_eq!(compact.size(), 255_356_395);
        assert_eq!(full.size() - compact.size(), 966_084_736);
        assert!(!compact.model_info().supports_streaming);
        assert!(matches!(compact.model_info().engine_type, EngineType::GigaAMZapformerCompact));
        assert!(compact.files.iter().all(|file| full.files.iter().any(|shared|
            shared.name == file.name && shared.size == file.size && shared.sha256 == file.sha256
        )));
    }

    #[tokio::test]
    async fn sharing_preserves_partial_downloads_and_independent_install_lifetimes() {
        let dir = tempfile::tempdir().unwrap();
        let sibling = dir.path().join("sibling");
        fs::create_dir(&sibling).unwrap();
        let source = sibling.join("encoder");
        let destination = dir.path().join("encoder");
        let temporary = dir.path().join(".reusing");
        let mut file = fixture().files.remove(0);
        file.sha256 = format!("{:x}", Sha256::digest(b"abc"));
        fs::write(&source, b"abc").unwrap();
        fs::write(&destination, b"a").unwrap();
        assert!(!file.reuse("test", &sibling, &destination, &temporary, &|_| {}).await.unwrap());
        assert_eq!(fs::read(&destination).unwrap(), b"a");
        fs::remove_file(&destination).unwrap();
        fs::write(&source, b"bad").unwrap();
        assert!(!file.reuse("test", &sibling, &destination, &temporary, &|_| {}).await.unwrap());
        assert!(!temporary.exists() && !destination.exists());
        assert_eq!(fs::read(&source).unwrap(), b"bad");
        fs::write(&source, b"abc").unwrap();
        assert!(file.reuse("test", &sibling, &destination, &temporary, &|_| {}).await.unwrap());
        assert!(!file.reuse("test", &sibling, &destination, &temporary, &|_| {}).await.unwrap());
        assert!(!temporary.exists());
        fs::remove_dir_all(&sibling).unwrap();
        assert_eq!(fs::read(&destination).unwrap(), b"abc");
    }

    #[test]
    fn interrupted_replacement_restores_old_bytes_and_verifies_size() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let pack = fixture();
        let target = root.join(&pack.id);
        let backup = pack.previous(root);
        fs::create_dir(&backup).unwrap();
        fs::write(backup.join("encoder"), b"old").unwrap();
        fs::write(backup.join(".verified"), pack.receipt()).unwrap();
        pack.recover(root).unwrap();
        assert!(pack.is_installed(&target));
        // No staged directory exists: promotion fails and rolls the rename back.
        assert!(pack.install(root).is_err());
        assert_eq!(fs::read(target.join("encoder")).unwrap(), b"old");
        fs::create_dir(pack.staging(root)).unwrap();
        fs::write(pack.staging(root).join("encoder"), b"new").unwrap();
        fs::write(pack.staging(root).join(".verified"), pack.receipt()).unwrap();
        assert_eq!(pack.partial_size(root), 3);
        pack.install(root).unwrap();
        assert_eq!(fs::read(target.join("encoder")).unwrap(), b"new");
        assert!(!backup.exists());
        fs::write(target.join("encoder"), b"x").unwrap();
        assert!(!pack.is_installed(&target));
    }
}
