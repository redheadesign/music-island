use crate::{config, logging};
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
}

pub fn collect(app: &AppHandle) -> anyhow::Result<String> {
    let package = app.package_info();
    let report = DiagnosticsReport {
        app_version: package.version.to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        config_path: config::config_path()?.display().to_string(),
        log_note: "Local startup/runtime logs are written by default for troubleshooting.".to_string(),
        log_path: logging::log_file_path().display().to_string(),
    };

    Ok(serde_json::to_string_pretty(&report)?)
}
