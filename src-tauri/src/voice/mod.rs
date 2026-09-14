//! In-process Better Voice engine (WASAPI + denoise + EQ + FX).
//! No sidecar / TCP — commands talk to AudioEngine directly.

mod agc;
mod assets;
mod audio_engine;
mod audio_init;
mod audio_utils;
mod bgm;
mod debug;
mod denoise;
mod device;
mod dsp;
mod eq;
mod explode;
mod mmcss;
mod vb_cable;
mod wasapi_capture;
mod wasapi_render;

use audio_engine::AudioEngine;
use eq::{EQ_FREQUENCIES, EQ_PRESET_NAMES};
use explode::ExplodeEffect;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub struct VoiceEngineState {
    pub engine: Mutex<AudioEngine>,
}

impl VoiceEngineState {
    pub fn new() -> Self {
        Self {
            engine: Mutex::new(AudioEngine::new(None)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VoiceAppSettings {
    pub hotkey: String,
    pub hotkey_enabled: bool,
    pub hotkey_explode: String,
    pub hotkey_explode_enabled: bool,
    pub hotkey_monitor: String,
    pub hotkey_monitor_enabled: bool,
    pub hotkey_bgm: String,
    pub hotkey_bgm_enabled: bool,
    pub hotkey_eq: String,
    pub hotkey_eq_enabled: bool,
    pub autostart: bool,
    pub language: String,
}

fn settings_path() -> PathBuf {
    dirs_path().join("voice-settings.json")
}

fn dirs_path() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Music Island")
}

fn read_voice_settings() -> VoiceAppSettings {
    let path = settings_path();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn write_voice_settings(settings: &VoiceAppSettings) -> Result<(), String> {
    let dir = dirs_path();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(settings_path(), raw).map_err(|e| e.to_string())
}

pub fn resolve_resource_dir(_app: &AppHandle) -> Option<PathBuf> {
    // Prefer AppData extract from the embedded payload (no resources/ next to exe).
    if let Ok(dir) = assets::ensure_voice_resources() {
        if dir.join("deepfilter").exists() || dir.join("models").exists() {
            return Some(dir);
        }
    }
    // Dev / CI fallback: read from the crate tree without copying.
    let mut candidates = Vec::new();
    candidates.push(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("voice"),
    );
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources"));
    for candidate in candidates {
        if candidate.join("models").exists()
            || candidate.join("deepfilter").exists()
            || candidate.join("denoise.onnx").exists()
        {
            return Some(candidate);
        }
    }
    None
}

fn opt_string(params: &Value, key: &str) -> Option<String> {
    params.get(key).and_then(Value::as_str).map(str::to_string)
}

fn opt_f32(params: &Value, key: &str) -> Option<f32> {
    params.get(key).and_then(Value::as_f64).map(|v| v as f32)
}

fn ok_json<T: serde::Serialize>(value: T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|e| e.to_string())
}

fn list_devices(direction: wasapi::Direction) -> Result<Value, String> {
    let _ = wasapi::initialize_mta().ok();
    let enumerator = wasapi::DeviceEnumerator::new()
        .map_err(|e| format!("Failed to create device enumerator: {e}"))?;
    let collection = enumerator
        .get_device_collection(&direction)
        .map_err(|e| format!("Failed to get device collection: {e}"))?;
    let mut devices = Vec::new();
    let count = collection.get_nbr_devices().unwrap_or(0);
    for i in 0..count {
        if let Ok(device) = collection.get_device_at_index(i) {
            if let Ok(name) = device.get_friendlyname() {
                if matches!(direction, wasapi::Direction::Capture) && name.contains("CABLE Output")
                {
                    continue;
                }
                devices.push(name);
            }
        }
    }
    ok_json(devices)
}

/// Single entry used by the frontend (`voice_invoke`) — same method names as the old IPC.
#[tauri::command]
pub fn voice_invoke(
    app: AppHandle,
    method: String,
    params: Option<Value>,
) -> Result<Value, String> {
    let params = params.unwrap_or(Value::Null);
    let state = app.state::<VoiceEngineState>();

    match method.as_str() {
        "ping" => Ok(json!({ "pong": true, "plugin": "better-voice", "mode": "in-process" })),
        "get_status" => {
            let engine = state.engine.lock();
            let running = engine.running().load(std::sync::atomic::Ordering::Relaxed);
            let config = engine.get_config();
            Ok(json!({
                "running": running,
                "enabled": config.enabled,
                "strength": config.strength,
                "micGain": config.mic_gain,
                "agcEnabled": config.agc_enabled,
                "agcTarget": config.agc_target,
            }))
        }
        "start_denoising" => {
            let input = opt_string(&params, "inputDevice");
            let output = opt_string(&params, "outputDevice");
            let model = opt_string(&params, "model");
            let resource_dir = resolve_resource_dir(&app);
            state
                .engine
                .lock()
                .start(input, output, model, resource_dir)?;
            // Remember desired engine state across app restarts.
            let mut settings = read_voice_settings();
            settings.autostart = true;
            let _ = write_voice_settings(&settings);
            Ok(json!({ "started": true }))
        }
        "stop_denoising" => {
            state.engine.lock().stop();
            let mut settings = read_voice_settings();
            settings.autostart = false;
            let _ = write_voice_settings(&settings);
            Ok(json!({ "stopped": true }))
        }
        "update_denoise_config" => {
            let engine = state.engine.lock();
            let mut config = engine.get_config();
            if let Some(enabled) = params.get("enabled").and_then(Value::as_bool) {
                config.enabled = enabled;
            }
            if let Some(strength) = opt_f32(&params, "strength") {
                config.strength = strength.clamp(0.0, 1.0);
            }
            if let Some(mic_gain) = opt_f32(&params, "micGain") {
                config.mic_gain = mic_gain.clamp(0.5, 10.0);
            }
            if let Some(suppress) = opt_f32(&params, "suppressLevel") {
                config.suppress_level = suppress.clamp(0.0, 1.0);
            }
            if let Some(agc_enabled) = params.get("agcEnabled").and_then(Value::as_bool) {
                config.agc_enabled = agc_enabled;
            }
            if let Some(agc_target) = opt_f32(&params, "agcTarget") {
                config.agc_target = agc_target.clamp(0.01, 1.0);
            }
            engine.update_config(config);
            Ok(json!({ "updated": true }))
        }
        "switch_model" => {
            let name = opt_string(&params, "modelName").unwrap_or_default();
            state.engine.lock().switch_model(name)?;
            Ok(json!({ "ok": true }))
        }
        "get_audio_stats" => {
            let stats = state.engine.lock().stats().read().clone();
            ok_json(stats)
        }
        "list_input_devices" => list_devices(wasapi::Direction::Capture),
        "list_output_devices" => list_devices(wasapi::Direction::Render),
        "list_denoise_models" => ok_json(denoise::list_models()),
        "set_monitor_mode" => {
            let enabled = params
                .get("enabled")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            state.engine.lock().set_monitor_enabled(enabled);
            Ok(json!({ "ok": true }))
        }
        "set_monitor_point" => {
            let point = params.get("point").and_then(Value::as_u64).unwrap_or(5) as u32;
            state.engine.lock().set_monitor_point(point);
            Ok(json!({ "ok": true }))
        }
        "update_eq_config" => {
            let engine = state.engine.lock();
            let mut config = engine.get_eq_config();
            if let Some(enabled) = params.get("enabled").and_then(Value::as_bool) {
                config.enabled = enabled;
            }
            if let Some(bands) = params.get("bands").and_then(Value::as_array) {
                let mut arr = [0.0f32; 10];
                for (i, value) in bands.iter().enumerate().take(10) {
                    if let Some(n) = value.as_f64() {
                        arr[i] = (n as f32).clamp(-12.0, 12.0);
                    }
                }
                config.bands = arr;
            }
            engine.update_eq_config(config);
            Ok(json!({ "ok": true }))
        }
        "get_eq_config" => ok_json(state.engine.lock().get_eq_config()),
        "get_eq_presets" => ok_json(
            EQ_PRESET_NAMES
                .iter()
                .map(|name| (name.to_string(), eq::get_preset(name).to_vec()))
                .collect::<Vec<_>>(),
        ),
        "get_eq_frequencies" => ok_json(EQ_FREQUENCIES.to_vec()),
        "set_explode_mode" => {
            let enabled = params
                .get("enabled")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let intensity = params
                .get("intensity")
                .and_then(Value::as_u64)
                .map(|v| v as u32);
            let engine = state.engine.lock();
            engine.set_explode_mode(enabled);
            if let Some(i) = intensity {
                engine.set_explode_intensity(i);
            }
            Ok(json!({ "ok": true }))
        }
        "set_explode_effect" => {
            let effect = params.get("effect").and_then(Value::as_u64).unwrap_or(0) as u32;
            state
                .engine
                .lock()
                .set_explode_effect(ExplodeEffect::from_u32(effect));
            Ok(json!({ "ok": true }))
        }
        "get_virtual_route_status" => ok_json(vb_cable::virtual_route_status()),
        "install_vb_cable" => {
            let resource = resolve_resource_dir(&app);
            vb_cable::install(resource.as_deref()).and_then(ok_json)
        }
        "uninstall_vb_cable" => {
            let resource = resolve_resource_dir(&app);
            vb_cable::uninstall(resource.as_deref()).and_then(ok_json)
        }
        "get_settings" => ok_json(read_voice_settings()),
        "save_settings" => {
            let settings: VoiceAppSettings = serde_json::from_value(
                params
                    .get("settings")
                    .cloned()
                    .unwrap_or_else(|| params.clone()),
            )
            .map_err(|e| e.to_string())?;
            write_voice_settings(&settings)?;
            Ok(json!({ "ok": true }))
        }
        other => Err(format!("unknown voice method: {other}")),
    }
}
