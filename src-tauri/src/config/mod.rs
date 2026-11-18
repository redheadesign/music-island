use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, RwLock},
};

const CONFIG_FILE_NAME: &str = "config.json";
const UI_PREFS_KEY: &str = "ui";
const INTERFACE_THEME_KEY: &str = "interfaceTheme";
const GLASS_DEFAULT_MARKER: &str = "interfaceThemeGlassDefaultApplied";
const DEFAULT_INTERFACE_THEME: &str = "glass";
const PLAYBACK_WAVE_KEY: &str = "playbackWaveEnabled";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub schema_version: u16,
    #[serde(default)]
    pub taskbar: TaskbarConfig,
    pub appearance: AppearanceConfig,
    pub layout: LayoutConfig,
    pub behavior: BehaviorConfig,
    pub modules: ModulesConfig,
    pub privacy: PrivacyConfig,
    #[serde(default)]
    pub media: MediaConfig,
    #[serde(default)]
    pub plugins: PluginsConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskbarConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_taskbar_scale")]
    pub scale: f64,
    #[serde(default)]
    pub show_like: bool,
}

impl Default for TaskbarConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            scale: default_taskbar_scale(),
            show_like: false,
        }
    }
}

fn default_taskbar_scale() -> f64 {
    1.0
}

fn sanitize_taskbar_scale(value: f64) -> f64 {
    if value.is_finite() {
        value.clamp(0.75, 1.25)
    } else {
        default_taskbar_scale()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginsConfig {
    #[serde(default)]
    pub enabled: Vec<String>,
    #[serde(default)]
    pub settings: HashMap<String, Value>,
}

impl PluginsConfig {
    fn ui_preferences_mut(&mut self) -> &mut Map<String, Value> {
        let ui = self.settings.entry(UI_PREFS_KEY.into()).or_insert(Value::Null);
        if !ui.is_object() {
            *ui = Value::Object(Map::new());
        }
        ui.as_object_mut().expect("UI preferences object")
    }

    fn glass_default_applied(&self) -> bool {
        self.settings
            .get(UI_PREFS_KEY)
            .and_then(|ui| ui.get(GLASS_DEFAULT_MARKER))
            .and_then(Value::as_bool)
            == Some(true)
    }

    fn apply_glass_default_once(&mut self) -> bool {
        if self.glass_default_applied() {
            return false;
        }
        let ui = self.ui_preferences_mut();
        ui.insert(INTERFACE_THEME_KEY.into(), DEFAULT_INTERFACE_THEME.into());
        ui.insert(GLASS_DEFAULT_MARKER.into(), true.into());
        true
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceConfig {
    pub theme: Theme,
    pub accent_color: String,
    pub opacity: f32,
    pub blur_strength: u8,
    pub corner_radius: u8,
    pub reduced_motion: bool,
    /// UI language. Opaque to the media protocol layer — frontend owns dictionaries.
    #[serde(default)]
    pub locale: Locale,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Locale {
    #[default]
    Ru,
    En,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutConfig {
    pub size: WidgetSize,
    #[serde(default = "default_width_percent")]
    pub width: u8,
    pub scale: u8,
    pub density: Density,
    pub show_artwork: bool,
    pub show_title: bool,
    pub show_artist: bool,
    pub show_progress: bool,
    pub show_source: bool,
    pub show_previous_next: bool,
    pub preset: LayoutPreset,
}

fn default_width_percent() -> u8 {
    100
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorConfig {
    pub hover_delay_ms: u16,
    pub auto_collapse_ms: u16,
    pub pin_expanded: bool,
    pub always_on_top: bool,
    pub launch_at_startup: bool,
    pub hide_over_fullscreen: bool,
    pub monitor_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModulesConfig {
    pub active_module: String,
    pub enabled_modules: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyConfig {
    pub telemetry_enabled: bool,
    pub write_detailed_logs: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaConfig {
    pub protocol: MediaProtocol,
    pub preferred_source_app_id: Option<String>,
    pub direct_yandex_consent: bool,
    #[serde(default)]
    pub direct_yandex_port: Option<u16>,
}

impl Default for MediaConfig {
    fn default() -> Self {
        Self {
            protocol: MediaProtocol::Smtc,
            preferred_source_app_id: None,
            direct_yandex_consent: false,
            direct_yandex_port: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MediaProtocol {
    Smtc,
    YandexDirect,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Theme {
    LiquidGlassDark,
    SoftLight,
    RuFlowInspired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WidgetSize {
    Small,
    Medium,
    Large,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Density {
    ButtonsOnly,
    Minimal,
    Balanced,
    Rich,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LayoutPreset {
    CleanControls,
    AlbumPill,
    NowPlayingRich,
    FocusMode,
}

impl AppConfig {
    fn migrate_interface_preferences(&mut self) -> bool {
        let mut changed = self.plugins.apply_glass_default_once();
        let ui = self.plugins.ui_preferences_mut();
        let old_bass = ui.remove("playbackReactiveWave");
        let old_visual = ui.remove("playbackVisual");
        changed |= old_bass.is_some() || old_visual.is_some();
        if ui.get(PLAYBACK_WAVE_KEY).and_then(Value::as_bool).is_none() {
            // Existing Direct users opted into process audio separately from the connection.
            let uses_direct = matches!(self.media.protocol, MediaProtocol::YandexDirect);
            let enabled = !uses_direct || old_bass.and_then(|v| v.as_bool()) == Some(true);
            ui.insert(PLAYBACK_WAVE_KEY.into(), enabled.into());
            changed = true;
        }
        changed
    }

    #[cfg(any(windows, test))]
    fn allows_playback_bass(&self) -> bool {
        let ui = self.plugins.settings.get(UI_PREFS_KEY);
        let preference = |key: &str| ui.and_then(|ui| ui.get(key));
        matches!(self.media.protocol, MediaProtocol::YandexDirect)
            && self.media.direct_yandex_consent
            && !self.appearance.reduced_motion
            && preference("reducedTransparency").and_then(Value::as_bool) != Some(true)
            && preference(INTERFACE_THEME_KEY).and_then(Value::as_str).unwrap_or(DEFAULT_INTERFACE_THEME) == "glass"
            && preference(PLAYBACK_WAVE_KEY).and_then(Value::as_bool) == Some(true)
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        let mut plugins = PluginsConfig::default();
        plugins.apply_glass_default_once();
        plugins.ui_preferences_mut().insert(PLAYBACK_WAVE_KEY.into(), true.into());
        Self {
            schema_version: 2,
            taskbar: TaskbarConfig::default(),
            appearance: AppearanceConfig {
                theme: Theme::LiquidGlassDark,
                accent_color: "#F76100".to_string(),
                opacity: 0.92,
                blur_strength: 28,
                corner_radius: 30,
                reduced_motion: false,
                locale: Locale::Ru,
            },
            layout: LayoutConfig {
                size: WidgetSize::Medium,
                width: default_width_percent(),
                scale: 100,
                density: Density::Balanced,
                show_artwork: true,
                show_title: true,
                show_artist: true,
                show_progress: true,
                show_source: true,
                show_previous_next: true,
                preset: LayoutPreset::AlbumPill,
            },
            behavior: BehaviorConfig {
                hover_delay_ms: 320,
                auto_collapse_ms: 900,
                pin_expanded: false,
                always_on_top: true,
                launch_at_startup: false,
                hide_over_fullscreen: true,
                monitor_id: None,
            },
            modules: ModulesConfig {
                active_module: "music".to_string(),
                enabled_modules: vec!["music".to_string()],
            },
            privacy: PrivacyConfig {
                telemetry_enabled: false,
                write_detailed_logs: false,
            },
            media: MediaConfig::default(),
            plugins,
        }
    }
}

#[derive(Clone)]
pub struct ConfigState {
    config: Arc<RwLock<AppConfig>>,
    persist_ui_migration: bool,
    read_failed: Arc<std::sync::atomic::AtomicBool>,
}

impl ConfigState {
    pub fn new() -> Self {
        Self::from_read(config_path().and_then(|path| read_config_at(&path)))
    }

    fn from_read(result: anyhow::Result<AppConfig>) -> Self {
        match result {
            Ok(config) => Self::from_config(config),
            Err(error) => {
                log::warn!("Could not read Music Island settings: {error:#}");
                let state = Self::from_config(AppConfig::default());
                state.read_failed.store(true, std::sync::atomic::Ordering::Release);
                state
            }
        }
    }

    fn require_loaded(&self) -> anyhow::Result<()> {
        anyhow::ensure!(!self.read_failed.load(std::sync::atomic::Ordering::Acquire), "Could not read the existing settings file");
        Ok(())
    }

    pub fn read_or_retry(&self) -> anyhow::Result<(AppConfig, bool)> {
        if self.require_loaded().is_ok() { return Ok((self.load()?, false)); }
        self.retry_at(&config_path()?)
    }

    fn retry_at(&self, path: &Path) -> anyhow::Result<(AppConfig, bool)> {
        let mut current = self.config.write().map_err(|_| anyhow::anyhow!("config lock poisoned"))?;
        let needs_recovery = self.require_loaded().is_err();
        if needs_recovery {
            let mut recovered = read_config_at(path)?;
            if recovered.migrate_interface_preferences() {
                if let Err(error) = handy_core::embedded_assets::atomic_write(path, &serde_json::to_vec_pretty(&recovered)?) {
                    log::warn!("Could not persist interface preferences after recovering settings: {error}");
                }
            }
            *current = recovered;
            self.read_failed.store(false, std::sync::atomic::Ordering::Release);
        }
        Ok((current.clone(), needs_recovery))
    }

    fn from_config(mut config: AppConfig) -> Self {
        let persist_ui_migration = config.migrate_interface_preferences();
        Self {
            config: Arc::new(RwLock::new(config)),
            persist_ui_migration,
            read_failed: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }

    /// Write only after the application has passed the single-instance check.
    pub fn persist_startup_migration(&self) -> anyhow::Result<()> {
        self.persist_startup_migration_to(&config_path()?)
    }

    fn persist_startup_migration_to(&self, path: &Path) -> anyhow::Result<()> {
        self.require_loaded()?;
        if self.persist_ui_migration {
            let current = self.config.read().map_err(|_| anyhow::anyhow!("config lock poisoned"))?;
            handy_core::embedded_assets::atomic_write(path, &serde_json::to_vec_pretty(&*current)?)?;
        }
        Ok(())
    }

    pub fn load(&self) -> anyhow::Result<AppConfig> {
        self.require_loaded()?;
        let config = self.config.read().map_err(|_| anyhow::anyhow!("config lock poisoned"))?.clone();
        Ok(config)
    }

    pub fn taskbar_enabled(&self) -> bool {
        self.config
            .read()
            .expect("config lock poisoned")
            .taskbar
            .enabled
    }

    #[cfg(windows)]
    pub(crate) fn playback_bass_enabled(&self) -> bool {
        self.config.read().is_ok_and(|config| config.allows_playback_bass())
    }

    pub fn save(&self, config: AppConfig) -> anyhow::Result<AppConfig> {
        self.save_to(config, &config_path()?)
    }

    pub fn save_edits(&self, base: &AppConfig, edited: AppConfig) -> anyhow::Result<AppConfig> {
        self.write_to(edited, Some(base), &config_path()?)
    }

    pub fn update_media(&self, update: impl FnOnce(&mut MediaConfig)) -> anyhow::Result<AppConfig> {
        self.update_media_to(update, &config_path()?)
    }

    fn update_media_to(&self, update: impl FnOnce(&mut MediaConfig), path: &Path) -> anyhow::Result<AppConfig> {
        let mut current = self.config.write().map_err(|_| anyhow::anyhow!("config lock poisoned"))?;
        self.require_loaded()?;
        let mut next = current.clone();
        update(&mut next.media);
        handy_core::embedded_assets::atomic_write(path, &serde_json::to_vec_pretty(&next)?)?;
        *current = next.clone();
        Ok(next)
    }

    fn save_to(&self, config: AppConfig, path: &Path) -> anyhow::Result<AppConfig> {
        self.write_to(config, None, path)
    }

    fn write_to(&self, config: AppConfig, base: Option<&AppConfig>, path: &Path) -> anyhow::Result<AppConfig> {
        let mut current = self.config.write().map_err(|_| anyhow::anyhow!("config lock poisoned"))?;
        self.require_loaded()?;
        let mut normalized = match base {
            Some(base) => merge_edits(base, &config, &current)?,
            None => config,
        };
        // Keep the user's audio choice if a stale webview omits the new field.
        if normalized.plugins.ui_preferences_mut().get(PLAYBACK_WAVE_KEY).and_then(Value::as_bool).is_none() {
            if let Some(wave) = current.plugins.settings.get(UI_PREFS_KEY).and_then(|ui| ui.get(PLAYBACK_WAVE_KEY)) {
                normalized.plugins.ui_preferences_mut().insert(PLAYBACK_WAVE_KEY.into(), wave.clone());
            }
        }
        normalized.schema_version = 2;
        normalized.layout.width = normalized.layout.width.clamp(80, 125);
        normalized.layout.scale = normalized.layout.scale.clamp(70, 120);
        normalized.taskbar.scale = sanitize_taskbar_scale(normalized.taskbar.scale);
        // The migration marker belongs to native storage. A webview may save a
        // config that omits it, including when the user switches to Classic.
        if current.plugins.glass_default_applied() {
            normalized.plugins.ui_preferences_mut().insert(GLASS_DEFAULT_MARKER.into(), true.into());
        }
        normalized.migrate_interface_preferences();
        handy_core::embedded_assets::atomic_write(path, &serde_json::to_vec_pretty(&normalized)?)?;
        *current = normalized.clone();
        Ok(normalized)
    }
}

/// Apply just the edited fields of a webview snapshot to the current config.
pub fn merge_edits(base: &AppConfig, edited: &AppConfig, current: &AppConfig) -> anyhow::Result<AppConfig> {
    fn merge(base: &Value, edited: &Value, current: &mut Value) {
        if base == edited { return; }
        if let (Some(before), Some(after), Some(target)) = (base.as_object(), edited.as_object(), current.as_object_mut()) {
            for key in before.keys().filter(|key| !after.contains_key(*key)) {
                target.remove(key);
            }
            for (key, value) in after {
                match before.get(key) {
                    Some(old) if old == value => {}
                    Some(old) => merge(old, value, target.entry(key.clone()).or_insert(Value::Null)),
                    None => { target.insert(key.clone(), value.clone()); }
                }
            }
        } else {
            *current = edited.clone();
        }
    }

    let mut value = serde_json::to_value(current)?;
    merge(&serde_json::to_value(base)?, &serde_json::to_value(edited)?, &mut value);
    let mut next: AppConfig = serde_json::from_value(value)?;
    // Provider, consent and port describe one connection.
    next.media = if base.media == edited.media { current.media.clone() } else { edited.media.clone() };
    Ok(next)
}

pub fn config_path() -> anyhow::Result<PathBuf> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    Ok(base.join("Music Island").join(CONFIG_FILE_NAME))
}

fn read_config_at(path: &Path) -> anyhow::Result<AppConfig> {
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(AppConfig::default()),
        Err(error) => return Err(error.into()),
    };
    let mut config: AppConfig = serde_json::from_str(&contents)?;
    config.schema_version = 2;
    if config.behavior.hover_delay_ms <= 70 {
        config.behavior.hover_delay_ms = 320;
    }
    config.taskbar.scale = sanitize_taskbar_scale(config.taskbar.scale);
    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrating_playback_preserves_process_audio_consent() {
        for (protocol, old_bass, expected) in [
            (MediaProtocol::Smtc, None, true),
            (MediaProtocol::YandexDirect, None, false),
            (MediaProtocol::YandexDirect, Some(false), false),
            (MediaProtocol::YandexDirect, Some(true), true),
        ] {
            let mut config = AppConfig::default();
            let direct = matches!(protocol, MediaProtocol::YandexDirect);
            config.media.protocol = protocol;
            config.media.direct_yandex_consent = direct;
            let ui = config.plugins.ui_preferences_mut();
            ui.remove(PLAYBACK_WAVE_KEY);
            ui.insert("playbackVisual".into(), "flow".into());
            if let Some(bass) = old_bass { ui.insert("playbackReactiveWave".into(), Value::Bool(bass)); }
            assert!(config.migrate_interface_preferences());
            assert_eq!(config.plugins.settings[UI_PREFS_KEY][PLAYBACK_WAVE_KEY], expected);
            assert_eq!(config.allows_playback_bass(), direct && expected);
            assert!(!config.migrate_interface_preferences());
            config.media.direct_yandex_consent = false;
            assert!(!config.allows_playback_bass());
        }
    }

    #[test]
    fn settings_edits_preserve_concurrent_provider_and_plugin_changes() {
        let base = AppConfig::default();
        let mut edited = base.clone();
        edited.appearance.locale = Locale::En;
        edited.plugins.ui_preferences_mut().insert(PLAYBACK_WAVE_KEY.into(), false.into());
        let mut current = base.clone();
        current.media.protocol = MediaProtocol::YandexDirect;
        current.media.direct_yandex_consent = true;
        current.plugins.ui_preferences_mut().insert("usageWidgetCompact".into(), true.into());
        let merged = merge_edits(&base, &edited, &current).unwrap();
        assert_eq!(merged.appearance.locale, Locale::En);
        assert_eq!(merged.media, current.media);
        assert_eq!(merged.plugins.settings[UI_PREFS_KEY]["usageWidgetCompact"], true);
        assert_eq!(merged.plugins.settings[UI_PREFS_KEY][PLAYBACK_WAVE_KEY], false);
    }

    #[test]
    fn unreadable_profile_is_protected_until_a_successful_reread() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CONFIG_FILE_NAME);
        fs::write(&path, "{broken").unwrap();
        let state = ConfigState::from_read(read_config_at(&path));
        assert!(state.load().is_err());
        assert!(state.persist_startup_migration_to(&path).is_err());
        assert!(state.save_to(AppConfig::default(), &path).is_err());
        assert!(state.update_media_to(|_| {}, &path).is_err());
        assert!(state.retry_at(&path).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "{broken");
        let mut repaired = AppConfig::default();
        repaired.behavior.hover_delay_ms = 678;
        repaired.plugins.ui_preferences_mut().remove(GLASS_DEFAULT_MARKER);
        fs::write(&path, serde_json::to_vec(&repaired).unwrap()).unwrap();
        assert_eq!(state.retry_at(&path).unwrap().0.behavior.hover_delay_ms, 678);
        assert_eq!(state.load().unwrap().behavior.hover_delay_ms, 678);
        assert!(read_config_at(&path).unwrap().plugins.glass_default_applied());
        assert!(!state.retry_at(&path).unwrap().1);
    }

    #[test]
    fn glass_is_the_default_for_a_fresh_profile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CONFIG_FILE_NAME);
        let state = ConfigState::from_config(AppConfig::default());
        let config = state.load().unwrap();
        assert_eq!(config.plugins.settings[UI_PREFS_KEY][INTERFACE_THEME_KEY], "glass");
        assert!(config.plugins.glass_default_applied());
        state.persist_startup_migration_to(&path).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn existing_classic_profile_migrates_once_and_keeps_a_later_classic_choice() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CONFIG_FILE_NAME);
        let mut legacy = AppConfig::default();
        legacy.plugins.settings.insert(UI_PREFS_KEY.into(), serde_json::json!({
            "interfaceTheme": "classic",
            "interfaceScenes": { "glass": "manta" },
            "interfacePalette": "ocean",
            "settingsColorScheme": "light",
            "reducedTransparency": true,
        }));
        legacy.behavior.hover_delay_ms = 620;
        fs::write(&path, serde_json::to_vec(&legacy).unwrap()).unwrap();
        let read_disk = || serde_json::from_slice::<AppConfig>(&fs::read(&path).unwrap()).unwrap();
        let state = ConfigState::from_config(read_disk());
        assert_eq!(state.load().unwrap().plugins.settings[UI_PREFS_KEY][INTERFACE_THEME_KEY], "glass");
        assert_eq!(read_disk().plugins.settings[UI_PREFS_KEY][INTERFACE_THEME_KEY], "classic");

        state.persist_startup_migration_to(&path).unwrap();
        let mut migrated = read_disk();
        let ui = &migrated.plugins.settings[UI_PREFS_KEY];
        assert!(migrated.plugins.glass_default_applied());
        assert_eq!(ui[INTERFACE_THEME_KEY], "glass");
        assert_eq!(ui["interfaceScenes"]["glass"], "manta");
        assert_eq!(ui["interfacePalette"], "ocean");
        assert_eq!(ui["settingsColorScheme"], "light");
        assert_eq!(ui["reducedTransparency"], true);
        assert_eq!(migrated.behavior.hover_delay_ms, 620);

        let submitted = migrated.plugins.ui_preferences_mut();
        submitted.insert(INTERFACE_THEME_KEY.into(), "classic".into());
        submitted.remove(GLASS_DEFAULT_MARKER);
        state.save_to(migrated, &path).unwrap();
        let reopened = ConfigState::from_config(read_disk());
        assert_eq!(reopened.load().unwrap().plugins.settings[UI_PREFS_KEY][INTERFACE_THEME_KEY], "classic");
        assert!(!reopened.persist_ui_migration);
    }

    #[test]
    fn native_media_update_preserves_current_non_media_settings() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        let state = ConfigState::from_config(AppConfig::default());
        let mut current = state.load().unwrap();
        current.behavior.hover_delay_ms = 777;
        state.save_to(current, &path).unwrap();
        let saved = state.update_media_to(|media| {
            media.protocol = MediaProtocol::YandexDirect;
            media.direct_yandex_consent = true;
            media.direct_yandex_port = Some(49200);
        }, &path).unwrap();
        assert_eq!(saved.behavior.hover_delay_ms, 777);
        let disk: AppConfig = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(disk.media.direct_yandex_port, Some(49200));
        state.update_media_to(|media| {
            media.protocol = MediaProtocol::Smtc;
            media.direct_yandex_consent = false;
            media.direct_yandex_port = None;
        }, &path).unwrap();
        assert_eq!(state.load().unwrap().behavior.hover_delay_ms, 777);
        assert!(!state.load().unwrap().media.direct_yandex_consent);
    }

    #[test]
    fn overlapping_saves_keep_disk_and_memory_in_agreement() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        let state = ConfigState::from_config(AppConfig::default());
        std::thread::scope(|scope| {
            for width in 80..100 {
                let state = &state;
                let path = &path;
                scope.spawn(move || {
                    let mut next = AppConfig::default(); next.layout.width = width;
                    state.save_to(next, path).unwrap();
                });
            }
        });
        let disk: AppConfig = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(disk.layout.width, state.load().unwrap().layout.width);
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn failed_save_preserves_the_current_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        let state = ConfigState::from_config(AppConfig::default());
        let mut next = state.load().unwrap(); next.layout.width = 125;
        assert!(state.save_to(next, dir.path()).is_err());
        assert_eq!(state.load().unwrap().layout.width, AppConfig::default().layout.width);
    }

    #[test]
    fn older_configs_keep_the_taskbar_player_off() {
        let mut legacy = serde_json::to_value(AppConfig::default()).unwrap();
        legacy.as_object_mut().unwrap().remove("taskbar");
        let loaded: AppConfig = serde_json::from_value(legacy).unwrap();
        assert!(!loaded.taskbar.enabled);
        assert_eq!(loaded.taskbar.scale, 1.0);
        assert!(!loaded.taskbar.show_like);
        assert_eq!(loaded.media.protocol, MediaProtocol::Smtc);
    }

    #[test]
    fn taskbar_preference_round_trips_without_changing_media_consent() {
        let mut config = AppConfig::default();
        config.taskbar.enabled = true;
        config.taskbar.scale = 1.25;
        config.taskbar.show_like = true;
        config.media.protocol = MediaProtocol::YandexDirect;
        config.media.direct_yandex_consent = true;
        let loaded: AppConfig =
            serde_json::from_str(&serde_json::to_string(&config).unwrap()).unwrap();
        assert!(loaded.taskbar.enabled);
        assert_eq!(loaded.taskbar.scale, 1.25);
        assert!(loaded.taskbar.show_like);
        assert_eq!(loaded.media.protocol, MediaProtocol::YandexDirect);
        assert!(loaded.media.direct_yandex_consent);
    }

    #[test]
    fn taskbar_scale_is_bounded_and_non_finite_values_use_the_default() {
        assert_eq!(sanitize_taskbar_scale(0.5), 0.75);
        assert_eq!(sanitize_taskbar_scale(1.1), 1.1);
        assert_eq!(sanitize_taskbar_scale(1.5), 1.25);
        assert_eq!(sanitize_taskbar_scale(f64::NAN), 1.0);
        assert_eq!(sanitize_taskbar_scale(f64::INFINITY), 1.0);
    }
}
