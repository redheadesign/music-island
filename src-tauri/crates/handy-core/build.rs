use std::{env, fs, path::PathBuf};
fn main() {
    println!("cargo:rerun-if-env-changed=MUSIC_ISLAND_DICTATION_BUNDLE");
    let mut source = String::from("pub static RUNTIME_FILES: &[(&str, &[u8])] = &[\n");
    if let Some(directory) = env::var_os("MUSIC_ISLAND_DICTATION_BUNDLE") {
        let directory = fs::canonicalize(directory).expect("Dictation bundle does not exist");
        println!("cargo:rerun-if-changed={}", directory.display());
        let mut paths: Vec<_> = fs::read_dir(directory)
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| p.extension().is_some_and(|e| e == "dll"))
            .collect();
        paths.sort();
        assert!(
            paths
                .iter()
                .any(|p| p.file_name().unwrap() == "music_island_dictation.dll"),
            "Build the inference DLL before packaging Music Island"
        );
        for path in paths {
            source.push_str(&format!(
                "({:?}, include_bytes!({:?})),\n",
                path.file_name().unwrap().to_str().unwrap(),
                path.to_str().unwrap()
            ));
        }
    } else if env::var("PROFILE").as_deref() == Ok("release") {
        panic!("Portable release requires MUSIC_ISLAND_DICTATION_BUNDLE; use the portable build script");
    }
    source.push_str("];\n");
    fs::write(
        PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("runtime_assets.rs"),
        source,
    )
    .unwrap();
}
