use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Arc, RwLock},
};

const CONFIG_FILE_NAME: &str = "config.json";

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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

impl Default for AppConfig {
    fn default() -> Self {
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
            plugins: PluginsConfig::default(),
        }
    }
}

#[derive(Clone)]
pub struct ConfigState {
    config: Arc<RwLock<AppConfig>>,
}

impl ConfigState {
    pub fn new() -> Self {
        Self {
            config: Arc::new(RwLock::new(load_from_disk().unwrap_or_default())),
        }
    }

    pub fn load(&self) -> anyhow::Result<AppConfig> {
        let config = self.config.read().expect("config lock poisoned").clone();
        Ok(config)
    }

    pub fn taskbar_enabled(&self) -> bool {
        self.config
            .read()
            .expect("config lock poisoned")
            .taskbar
            .enabled
    }

    pub fn save(&self, config: AppConfig) -> anyhow::Result<AppConfig> {
        let mut normalized = config;
        normalized.schema_version = 2;
        normalized.layout.width = normalized.layout.width.clamp(80, 125);
        normalized.layout.scale = normalized.layout.scale.clamp(70, 120);
        normalized.taskbar.scale = sanitize_taskbar_scale(normalized.taskbar.scale);
        let path = config_path()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, serde_json::to_string_pretty(&normalized)?)?;
        *self.config.write().expect("config lock poisoned") = normalized.clone();
        Ok(normalized)
    }
}

pub fn config_path() -> anyhow::Result<PathBuf> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    Ok(base.join("Music Island").join(CONFIG_FILE_NAME))
}

fn load_from_disk() -> anyhow::Result<AppConfig> {
    let path = config_path()?;
    let contents = fs::read_to_string(path)?;
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
