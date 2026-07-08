use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub enabled: bool,
    pub has_update: bool,
    pub current_version: String,
    pub message: String,
}

pub async fn check_for_updates(app: AppHandle) -> anyhow::Result<UpdateCheckResult> {
    let current_version = app.package_info().version.to_string();

    // The updater plugin is intentionally documented but not activated until a
    // real signing key exists. Tauri will reject unsigned update bundles.
    Ok(UpdateCheckResult {
        enabled: false,
        has_update: false,
        current_version,
        message: "Auto-update is reserved for signed GitHub Releases. Install a newer .exe over the current version for MVP builds.".to_string(),
    })
}
