use flate2::{read::ZlibDecoder, write::ZlibEncoder, Compression};
use sha2::{Digest, Sha256};
use std::{
    env, fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

fn write_if_changed(path: &Path, bytes: &[u8]) {
    if !fs::read(path).is_ok_and(|existing| existing == bytes) {
        fs::write(path, bytes).expect("write embedded asset");
    }
}

fn verified_pack(path: &Path, original: &[u8]) -> Option<Vec<u8>> {
    let packed = fs::read(path).ok()?;
    let mut decoder = ZlibDecoder::new(packed.as_slice());
    let mut decoded = Vec::with_capacity(original.len());
    decoder
        .by_ref()
        .take(original.len() as u64 + 1)
        .read_to_end(&mut decoded)
        .ok()?;
    (decoded == original && decoder.total_in() == packed.len() as u64).then_some(packed)
}

fn store_cache(path: &Path, packed: &[u8]) {
    // Each build script has its own process and only publishes complete files.
    let temporary = path.with_extension(format!("{}.tmp", std::process::id()));
    if fs::write(&temporary, packed)
        .and_then(|()| fs::rename(&temporary, path))
        .is_err()
    {
        let _ = fs::remove_file(temporary);
    }
}

fn pack_asset(original: &[u8], output: &Path, cache: Option<&Path>) {
    if let Some(packed) = verified_pack(output, original) {
        if let Some(cache) = cache.filter(|path| !path.exists()) {
            store_cache(cache, &packed);
        }
        return;
    }
    let packed = cache
        .and_then(|path| verified_pack(path, original))
        .unwrap_or_else(|| {
            let mut encoder = ZlibEncoder::new(Vec::new(), Compression::best());
            encoder
                .write_all(original)
                .expect("compress embedded asset");
            let packed = encoder.finish().expect("finish asset compression");
            if let Some(cache) = cache {
                store_cache(cache, &packed);
            }
            packed
        });
    fs::write(output, packed).expect("write compressed asset");
}

pub fn embed_files(mut files: Vec<(String, PathBuf)>, output: &Path, symbol: &str) {
    files.sort_by(|a, b| a.0.cmp(&b.0));
    let cache = env::var_os("MUSIC_ISLAND_ASSET_CACHE")
        .map(PathBuf::from)
        .filter(|path| fs::create_dir_all(path).is_ok());
    let mut source = format!("static {symbol}: &[EmbeddedAsset] = &[\n");
    for (name, path) in files {
        println!("cargo:rerun-if-changed={}", path.display());
        let bytes = fs::read(&path).expect("read embedded asset");
        let hash = Sha256::digest(&bytes);
        let sha256: [u8; 32] = hash.into();
        let packed = output.with_file_name(format!("{symbol}-{hash:x}.zlib"));
        let cached = cache
            .as_ref()
            .map(|path| path.join(format!("{hash:x}.zlib")));
        pack_asset(&bytes, &packed, cached.as_deref());
        source.push_str(&format!(
            "EmbeddedAsset {{ name: {name:?}, size: {}, sha256: {sha256:?}, packed: include_bytes!({:?}) }},\n",
            bytes.len(), packed.to_str().unwrap()
        ));
    }
    source.push_str("];\n");
    write_if_changed(output, source.as_bytes());
}

pub fn embed_directory(root: &Path, output: &Path, symbol: &str) {
    fn collect(root: &Path, dir: &Path, files: &mut Vec<(String, PathBuf)>) {
        println!("cargo:rerun-if-changed={}", dir.display());
        for entry in fs::read_dir(dir).expect("read asset directory") {
            let entry = entry.unwrap();
            let name = entry.file_name();
            // Portable builds never carry virtual microphone drivers or placeholder files.
            if name.to_string_lossy().starts_with('.') || name == "vb-cable" {
                continue;
            }
            let path = entry.path();
            if entry.file_type().unwrap().is_dir() {
                collect(root, &path, files);
            } else {
                files.push((
                    path.strip_prefix(root)
                        .unwrap()
                        .to_str()
                        .unwrap()
                        .replace('\\', "/"),
                    path,
                ));
            }
        }
    }
    let mut files = Vec::new();
    collect(root, root, &mut files);
    embed_files(files, output, symbol);
}
