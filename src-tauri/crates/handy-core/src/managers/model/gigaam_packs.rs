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

#[derive(Deserialize)]
struct PackFile {
    name: String,
    url: String,
    size: u64,
    sha256: String,
}

#[derive(Deserialize)]
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
        serde_json::from_str(include_str!("../../catalog/gigaam-packs.json"))
            .expect("invalid bundled GigaAM package catalog")
    })
}

pub(super) fn find(id: &str) -> Option<&'static Pack> {
    catalog().iter().find(|pack| pack.id == id)
}

impl Pack {
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
            is_downloaded: false,
            is_downloading: false,
            partial_size: 0,
            is_directory: true,
            engine_type: EngineType::GigaAMZapformer,
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
            let result = Self::download_http_resumable_with_events(
                id,
                &file.url,
                &staging.join(&file.name),
                Some(file.size),
                Some(&file.sha256),
                &token,
                &|event| match event {
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
                },
            )
            .await
            .with_context(|| format!("Downloading {}", file.name))?;
            if matches!(result, HttpDownloadOutcome::Cancelled) {
                return Ok(());
            }
            finished += file.size;
            let _ = self.app_handle.emit("model-download-progress", DownloadProgress {
                model_id: id.into(), downloaded: finished, total,
                percentage: 100.0 * finished as f64 / total as f64,
            });
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
