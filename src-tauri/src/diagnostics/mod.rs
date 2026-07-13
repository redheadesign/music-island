use crate::{config, logging, media, window, yandex};
use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsReport {
    app_version: String,
    os: String,
    arch: String,
    config_path: String,
    log_note: String,
    log_path: String,
    smtc_health: media::health::SmtcHealthSnapshot,
    direct_yandex: yandex::DirectYandexStatus,
    media_metrics: media::MediaMetrics,
    direct_metrics: yandex::DirectMetrics,
    window_metrics: window::WindowMetrics,
}

pub async fn collect(app: &AppHandle) -> anyhow::Result<String> {
    let package = app.package_info();
    let report = DiagnosticsReport {
        app_version: package.version.to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        config_path: config::config_path()?.display().to_string(),
        log_note: "Local startup/runtime logs are written by default for troubleshooting."
            .to_string(),
        log_path: logging::log_file_path().display().to_string(),
        smtc_health: media::current_health(),
        direct_yandex: yandex::status(),
        media_metrics: media::metrics(),
        direct_metrics: yandex::metrics().await,
        window_metrics: window::metrics(),
    };

    Ok(serde_json::to_string_pretty(&report)?)
}
