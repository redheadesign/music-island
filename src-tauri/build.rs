#[path = "crates/handy-core/embed_assets.rs"]
mod embed_assets;
fn main() {
    // `generate_context!` tracks the files already embedded. Watch the output
    // directory as well so newly added frontend assets trigger a rebuild.
    if std::path::Path::new("../dist").is_dir() {
        println!("cargo:rerun-if-changed=../dist");
    }
    embed_assets::embed_directory(
        std::path::Path::new("resources/voice"),
        &std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("voice_assets.rs"),
        "VOICE_FILES",
    );
    let windows = tauri_build::WindowsAttributes::new()
        .app_manifest(include_str!("windows-app-manifest.xml"));
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(windows)
        .plugin("dictation", tauri_build::InlinedPlugin::new());

    tauri_build::try_build(attributes).expect("failed to run Tauri build script");
}
