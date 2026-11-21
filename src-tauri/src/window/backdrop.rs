//! Native materials behind the transparent WebView. Host frost uses DWM.
//! The optional desktop lens keeps its Windows Graphics Capture frames on GPU.
#[cfg(windows)]
mod compositor;
mod geometry;
#[cfg(windows)]
mod native;

pub use geometry::{BackdropFrame, BackdropRegion};

#[tauri::command]
pub async fn request_glass_borderless(window: tauri::WebviewWindow) -> Result<bool, String> {
    if window.label() != "settings" {
        return Err("Open Settings to request borderless capture".into());
    }
    #[cfg(windows)]
    return tokio::task::spawn_blocking(native::request_borderless)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string());
    #[cfg(not(windows))]
    Ok(false)
}

#[tauri::command]
pub async fn set_overlay_backdrop(
    window: tauri::WebviewWindow,
    frame: BackdropFrame,
) -> Result<Option<bool>, String> {
    if !matches!(window.label(), "main" | "recording_overlay") {
        return Err("Only an overlay can set its backdrop".into());
    }
    if !frame.is_valid() {
        return Err("Invalid overlay backdrop geometry".into());
    }
    #[cfg(windows)]
    {
        use tauri::Manager;
        use windows::Win32::Foundation::HWND;
        let (send, receive) = tokio::sync::oneshot::channel();
        let app = window.app_handle().clone();
        let label = window.label().to_string();
        let main = window.clone();
        window
            .run_on_main_thread(move || {
                let result = main
                    .hwnd()
                    .map_err(|error| error.to_string())
                    .and_then(|hwnd| native::apply(HWND(hwnd.0), &app, &label, frame));
                let _ = send.send(result);
            })
            .map_err(|error| error.to_string())?;
        receive
            .await
            .map_err(|_| "Backdrop window closed".to_string())?
    }
    #[cfg(not(windows))]
    Ok(Some(false))
}
