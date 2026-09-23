use crate::{
    managers::{
        audio::AudioRecordingManager, history::HistoryManager, model::ModelManager,
        transcription::TranscriptionManager,
    },
    settings,
};
use anyhow::{anyhow, bail, Result};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
};
use tauri::{AppHandle, Emitter, Manager};
static ORIGINAL_HF: OnceLock<PathBuf> = OnceLock::new();
pub fn remember_hf() {
    ORIGINAL_HF.get_or_init(|| {
        std::env::var_os("HF_HUB_CACHE")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HF_HOME").map(|p| PathBuf::from(p).join("hub")))
            .unwrap_or_else(|| {
                PathBuf::from(std::env::var_os("USERPROFILE").unwrap_or_default())
                    .join(".cache/huggingface/hub")
            })
    });
}
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportItem {
    pub id: String,
    pub name: String,
    pub source: String,
    pub bytes: u64,
    pub exists: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub items: Vec<ImportItem>,
    pub settings: Vec<String>,
    pub settings_path: String,
}
struct Candidate {
    item: ImportItem,
    source: PathBuf,
    destination: PathBuf,
}
const IMPORT_FIELDS: &[&str] = &[
    "selected_model",
    "selected_microphone",
    "selected_channel",
    "selected_output_device",
    "selected_language",
    "translate_to_english",
    "shortcut_activation",
    "hold_threshold_ms",
    "bindings",
    "custom_words",
    "word_correction_threshold",
    "filler_word_removal_enabled",
    "custom_filler_words",
    "vad_enabled",
    "vad_backend",
    "audio_feedback",
    "audio_feedback_volume",
    "sound_theme",
    "mute_while_recording",
    "paste_method",
    "clipboard_handling",
    "append_trailing_space",
    "paste_delay_ms",
    "paste_delay_after_ms",
    "model_unload_timeout",
    "transcribe_accelerator",
    "transcribe_gpu_device",
    "post_process_prompts",
    "post_process_selected_prompt_id",
];
fn handy() -> Result<PathBuf> {
    Ok(
        PathBuf::from(std::env::var_os("APPDATA").ok_or_else(|| anyhow!("APPDATA unavailable"))?)
            .join("com.pais.handy"),
    )
}
fn own() -> PathBuf {
    crate::portable::data_dir().unwrap().clone()
}
fn is_link(meta: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    meta.file_attributes() & 0x400 != 0
}
pub fn owned_bytes(path: &Path) -> Result<u64> {
    if !path.exists() {
        return Ok(0);
    }
    let meta = fs::symlink_metadata(path)?;
    if is_link(&meta) {
        return Ok(0);
    }
    if meta.is_file() {
        return Ok(meta.len());
    }
    let mut bytes = 0;
    for item in fs::read_dir(path)? {
        bytes += owned_bytes(&item?.path())?;
    }
    Ok(bytes)
}
pub fn remove_owned(path: &Path, root: &Path) -> Result<()> {
    if !path.starts_with(root)
        || path
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        bail!("Refusing to remove an external path")
    }
    validate_parents(path)?;
    let meta = match fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e.into()),
    };
    if meta.is_file() {
        fs::remove_file(path)?;
    } else if is_link(&meta) {
        fs::remove_dir(path)?;
    } else {
        for entry in fs::read_dir(path)? {
            remove_owned(&entry?.path(), root)?;
        }
        fs::remove_dir(path)?;
    }
    Ok(())
}
fn validate_parents(path: &Path) -> Result<()> {
    for parent in path.ancestors().skip(1) {
        if fs::symlink_metadata(parent).is_ok_and(|m| is_link(&m)) {
            bail!("Owned storage must not traverse a reparse point")
        }
    }
    Ok(())
}
fn candidates() -> Result<Vec<Candidate>> {
    remember_hf();
    let mut result = Vec::new();
    for (kind, source, destination) in [
        ("models", handy()?.join("models"), own().join("models")),
        (
            "hf",
            ORIGINAL_HF.get().unwrap().clone(),
            own().join("huggingface/hub"),
        ),
    ] {
        if !source.is_dir() {
            continue;
        }
        for entry in fs::read_dir(&source)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if name.ends_with(".partial")
                || name.starts_with('.')
                || (kind == "hf" && !name.starts_with("models--"))
            {
                continue;
            }
            let from = entry.path();
            if is_link(&fs::symlink_metadata(&from)?) {
                continue;
            }
            let target = destination.join(&name);
            result.push(Candidate {
                item: ImportItem {
                    id: format!("{kind}/{name}"),
                    name,
                    source: from.to_string_lossy().into(),
                    bytes: owned_bytes(&from)?,
                    exists: target.exists(),
                },
                source: from,
                destination: target,
            });
        }
    }
    result.sort_by(|a, b| a.item.id.cmp(&b.item.id));
    Ok(result)
}
#[tauri::command]
pub async fn preview_handy_import() -> Result<ImportPreview, String> {
    tauri::async_runtime::spawn_blocking(|| -> Result<ImportPreview> {
        let settings_path = handy()?.join(settings::SETTINGS_STORE_PATH);
        let value = fs::read(&settings_path)
            .ok()
            .and_then(|s| serde_json::from_slice::<serde_json::Value>(&s).ok());
        let fields = IMPORT_FIELDS
            .iter()
            .filter(|field| {
                value
                    .as_ref()
                    .and_then(|v| v.get("settings"))
                    .is_some_and(|v| v.get(**field).is_some())
            })
            .map(|s| s.to_string())
            .collect();
        Ok(ImportPreview {
            items: candidates()?.into_iter().map(|c| c.item).collect(),
            settings: fields,
            settings_path: settings_path.to_string_lossy().into(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}
struct ImportJob {
    id: String,
    cancel: Arc<AtomicBool>,
}
static IMPORT: OnceLock<Mutex<Option<ImportJob>>> = OnceLock::new();
fn job() -> &'static Mutex<Option<ImportJob>> {
    IMPORT.get_or_init(Default::default)
}
#[tauri::command]
pub fn cancel_import(operation_id: String) {
    if let Some(active) = job().lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
        if active.id == operation_id {
            active.cancel.store(true, Ordering::Relaxed);
        }
    }
}
fn copy_tree(
    source: &Path,
    destination: &Path,
    source_root: &Path,
    cancel: &AtomicBool,
) -> Result<()> {
    copy_tree_inner(
        source,
        destination,
        source_root,
        cancel,
        &mut std::collections::HashMap::new(),
    )
}
fn copy_tree_inner(
    source: &Path,
    destination: &Path,
    source_root: &Path,
    cancel: &AtomicBool,
    copied: &mut std::collections::HashMap<PathBuf, PathBuf>,
) -> Result<()> {
    if cancel.load(Ordering::Relaxed) {
        bail!("Import cancelled")
    }
    let canonical = fs::canonicalize(source)?;
    if !canonical.starts_with(source_root) {
        bail!("Model contains a link outside its source folder")
    }
    let meta = fs::metadata(&canonical)?;
    validate_parents(destination)?;
    if meta.is_dir() {
        if is_link(&fs::symlink_metadata(source)?) {
            bail!("Directory links are not imported")
        }
        fs::create_dir_all(destination)?;
        for child in fs::read_dir(source)? {
            let child = child?;
            copy_tree_inner(
                &child.path(),
                &destination.join(child.file_name()),
                source_root,
                cancel,
                copied,
            )?;
        }
    } else {
        use std::io::{Read, Write};
        fs::create_dir_all(destination.parent().unwrap())?;
        if let Some(previous) = copied.get(&canonical) {
            fs::hard_link(previous, destination)?;
            return Ok(());
        }
        let mut input = fs::File::open(&canonical)?;
        let mut output = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(destination)?;
        let mut buffer = vec![0u8; 1024 * 1024];
        loop {
            if cancel.load(Ordering::Relaxed) {
                bail!("Import cancelled")
            };
            let n = input.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            output.write_all(&buffer[..n])?;
        }
        output.sync_all()?;
        copied.insert(canonical, destination.to_path_buf());
    }
    Ok(())
}
#[tauri::command]
pub async fn import_handy(
    app: AppHandle,
    operation_id: String,
    ids: Vec<String>,
    include_settings: bool,
) -> Result<(), String> {
    if operation_id.is_empty() || operation_id.len() > 100 {
        return Err("Invalid operation id".into());
    }
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut active = job().lock().unwrap_or_else(|e| e.into_inner());
        if active.is_some() {
            return Err("An import is already running".into());
        }
        *active = Some(ImportJob {
            id: operation_id.clone(),
            cancel: cancel.clone(),
        });
    }
    let result=tauri::async_runtime::spawn_blocking(move || -> Result<()> {
        let available=candidates()?;
        for id in &ids {if !available.iter().any(|c|&c.item.id==id){bail!("Import source changed; refresh the preview")}}
        for (index,candidate) in available.into_iter().filter(|c|ids.contains(&c.item.id)).enumerate() {
            if candidate.destination.exists(){bail!("Model already exists: {}",candidate.item.name)}
            let stage=own().join("imports").join(format!("{}-{index}",std::process::id()));
            if stage.exists(){bail!("An unfinished import exists. Remove it in System → Data.")}
            let source_root=if candidate.source.is_dir(){fs::canonicalize(&candidate.source)?}else{fs::canonicalize(candidate.source.parent().unwrap())?};
            let copy=copy_tree(&candidate.source,&stage,&source_root,&cancel);
            if let Err(error)=copy {let _=remove_owned(&stage,&own());return Err(error);}
            fs::create_dir_all(candidate.destination.parent().unwrap())?;
            if let Err(error)=fs::rename(&stage,&candidate.destination) {let _=remove_owned(&stage,&own());return Err(error.into());}
            let _=app.emit("dictation:import-progress",serde_json::json!({"operationId":operation_id,"completed":index+1,"total":ids.len()}));
        }
        if include_settings {
            let imported:serde_json::Value=serde_json::from_slice(&fs::read(handy()?.join(settings::SETTINGS_STORE_PATH))?)?;
            let mut current=serde_json::to_value(settings::get_settings(&app))?;
            for key in IMPORT_FIELDS {if let Some(value)=imported.get("settings").and_then(|v|v.get(*key)){current[*key]=value.clone();}}
            // Cloud processing, auto-submit, external scripts and credentials
            // are never enabled by import. User can configure them explicitly.
            if current["paste_method"]=="external_script" {current["paste_method"]="ctrl_v".into();}
            let imported:settings::AppSettings=serde_json::from_value(current)?;
            settings::write_settings(&app,imported);
            if app.try_state::<Arc<AudioRecordingManager>>().is_some(){crate::shortcut::suspend_all_shortcuts(&app);crate::shortcut::resume_all_shortcuts(&app);}
        }
        if let Some(manager)=app.try_state::<Arc<ModelManager>>(){manager.rescan_local_models()?;}
        Ok(())
    }).await.map_err(|e|e.to_string()).and_then(|result|result.map_err(|e|format!("{e:#}")));
    *job().lock().unwrap_or_else(|e| e.into_inner()) = None;
    result
}
pub fn stop(app: &AppHandle) {
    if let Some(active) = job().lock().unwrap_or_else(|e| e.into_inner()).as_ref() {
        active.cancel.store(true, Ordering::Relaxed);
    }
    if let Some(audio) = app.try_state::<Arc<AudioRecordingManager>>() {
        crate::shortcut::suspend_all_shortcuts(app);
        crate::utils::cancel_current_operation(app);
        audio.stop_microphone_stream();
    }
    if let Some(transcription) = app.try_state::<Arc<TranscriptionManager>>() {
        let _ = transcription.unload_model();
    }
    if let Some(models) = app.try_state::<Arc<ModelManager>>() {
        models.cancel_all_downloads();
    }
}
/// Host shutdown owns the deadline; these jobs only write our private storage.
pub fn wait_for_io_to_stop(app: &AppHandle) {
    loop {
        let importing = job().lock().unwrap_or_else(|e| e.into_inner()).is_some();
        let downloading = app.try_state::<Arc<ModelManager>>()
            .is_some_and(|models| models.has_active_downloads());
        if !importing && !downloading { return; }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
}

#[tauri::command]
pub async fn clear_history(app: AppHandle) -> Result<(), String> {
    let manager = match app.try_state::<Arc<HistoryManager>>() {
        Some(m) => m.inner().clone(),
        None => Arc::new(HistoryManager::new(&app).map_err(|e| e.to_string())?),
    };
    loop {
        let entries = manager
            .get_history_entries(None, Some(500))
            .await
            .map_err(|e| e.to_string())?
            .entries;
        if entries.is_empty() {
            break;
        }
        for entry in entries {
            manager
                .delete_entry(entry.id)
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn remove_all_models(app: AppHandle) -> Result<(), String> {
    stop(&app);
    let result = async {
        for _ in 0..300 {
            let importing = job().lock().unwrap_or_else(|e| e.into_inner()).is_some();
            let transcribing = app
                .try_state::<Arc<TranscriptionManager>>()
                .is_some_and(|m| m.is_model_loaded());
            if !importing && !transcribing {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
        if job().lock().unwrap_or_else(|e| e.into_inner()).is_some()
            || app
                .try_state::<Arc<TranscriptionManager>>()
                .is_some_and(|m| m.is_model_loaded())
        {
            return Err("Dictation is still stopping. Try again.".into());
        }
        if let Some(models) = app.try_state::<Arc<ModelManager>>() {
            for _ in 0..300 {
                if !models.has_active_downloads() {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
            if models.has_active_downloads() {
                return Err("Downloads are still stopping. Try again.".into());
            }
            for model in models.get_available_models() {
                if model.is_downloaded {
                    models.delete_model(&model.id).map_err(|e| e.to_string())?;
                }
            }
        }
        for child in ["models", "huggingface", "imports"] {
            remove_owned(&own().join(child), &own()).map_err(|e| e.to_string())?;
        }
        if let Some(models) = app.try_state::<Arc<ModelManager>>() {
            models.rescan_local_models().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    .await;
    if crate::is_enabled() {
        crate::shortcut::resume_all_shortcuts(&app);
    }
    result
}

#[tauri::command]
pub async fn import_custom_model(app: AppHandle, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<()> {
        let source = fs::canonicalize(path.trim().trim_matches('"'))?;
        if !source.is_file()
            || !matches!(
                source.extension().and_then(|s| s.to_str()),
                Some("bin" | "gguf")
            )
        {
            bail!("Choose a BIN or GGUF model file")
        }
        let destination = own().join("models").join(
            source
                .file_name()
                .ok_or_else(|| anyhow!("Invalid filename"))?,
        );
        if destination.exists() {
            bail!("A model with this filename already exists")
        }
        let stage = destination.with_extension("importing");
        let result = copy_tree(
            &source,
            &stage,
            &fs::canonicalize(source.parent().unwrap())?,
            &AtomicBool::new(false),
        );
        if let Err(error) = result {
            let _ = remove_owned(&stage, &own());
            return Err(error);
        }
        fs::rename(stage, destination)?;
        if let Some(models) = app.try_state::<Arc<ModelManager>>() {
            models.rescan_local_models()?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn import_copies_without_modifying_source_and_refuses_overwrite() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source");
        let dest = temp.path().join("owned");
        fs::create_dir(&source).unwrap();
        fs::write(source.join("model.bin"), b"original model").unwrap();
        copy_tree(
            &source,
            &dest,
            &fs::canonicalize(&source).unwrap(),
            &AtomicBool::new(false),
        )
        .unwrap();
        assert_eq!(fs::read(dest.join("model.bin")).unwrap(), b"original model");
        assert!(copy_tree(
            &source,
            &dest,
            &fs::canonicalize(&source).unwrap(),
            &AtomicBool::new(false)
        )
        .is_err());
        remove_owned(&dest, &dest).unwrap();
        assert_eq!(
            fs::read(source.join("model.bin")).unwrap(),
            b"original model"
        );
        assert!(remove_owned(&source, &dest).is_err());
        assert!(remove_owned(&dest.join("../source"), &dest).is_err());
    }
    #[test]
    fn cancelled_import_creates_no_output() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source.bin");
        fs::write(&source, b"model").unwrap();
        let dest = temp.path().join("owned.bin");
        assert!(copy_tree(
            &source,
            &dest,
            &fs::canonicalize(temp.path()).unwrap(),
            &AtomicBool::new(true)
        )
        .is_err());
        assert!(!dest.exists());
    }
}
