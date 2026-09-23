fn main() {
    let windows = tauri_build::WindowsAttributes::new()
        .app_manifest(include_str!("windows-app-manifest.xml"));
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(windows)
        .plugin("dictation", tauri_build::InlinedPlugin::new());

    tauri_build::try_build(attributes).expect("failed to run Tauri build script");
}
