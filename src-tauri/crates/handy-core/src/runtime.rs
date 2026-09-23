//! Versioned C ABI client. No Tauri, Rust object or allocator crosses the DLL.
use anyhow::{anyhow, bail, Context, Result};
use music_island_dictation_protocol::{self as protocol, *};
use serde::de::DeserializeOwned;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    sync::OnceLock,
};
include!(concat!(env!("OUT_DIR"), "/runtime_assets.rs"));
struct Runtime {
    _library: libloading::Library,
    call: Call,
    release: Release,
}
static RUNTIME: OnceLock<Result<Runtime, String>> = OnceLock::new();
pub(crate) fn checked_directory(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        if parent != path {
            checked_directory(parent)?;
        }
    }
    if path.exists() {
        let m = std::fs::symlink_metadata(path)?;
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if m.file_attributes() & 0x400 != 0 {
                bail!("Runtime directory must not be a reparse point");
            }
        }
        if !m.is_dir() {
            bail!("Runtime path is not a directory");
        }
    } else {
        std::fs::create_dir(path)?;
    }
    Ok(())
}
fn extract() -> Result<PathBuf> {
    if RUNTIME_FILES.is_empty() {
        bail!("This development build has no dictation engine. Run npm run dictation:bundle, then rebuild.");
    }
    let mut digest = Sha256::new();
    for (name, bytes) in RUNTIME_FILES {
        digest.update(name);
        digest.update(Sha256::digest(bytes));
    }
    let version = format!("abi{}-{:x}", ABI_VERSION, digest.finalize());
    let path = crate::portable::resources().join(version);
    checked_directory(&path)?;
    for (name, bytes) in RUNTIME_FILES {
        let target = path.join(name);
        if let Ok(meta) = std::fs::symlink_metadata(&target) {
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if meta.file_attributes() & 0x400 != 0 {
                    bail!("Runtime file must not be a reparse point");
                }
            }
            if !meta.is_file() {
                bail!("Invalid runtime file");
            }
        }
        if std::fs::read(&target).is_ok_and(|b| Sha256::digest(&b) == Sha256::digest(bytes)) {
            continue;
        }
        let temporary = target.with_extension(format!("{}.extracting", std::process::id()));
        {
            use std::io::Write;
            let mut f = std::fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&temporary)?;
            f.write_all(bytes)?;
            f.sync_all()?;
        }
        std::fs::rename(&temporary, &target)?;
        if Sha256::digest(std::fs::read(&target)?) != Sha256::digest(bytes) {
            bail!("Runtime integrity check failed");
        }
    }
    Ok(std::fs::canonicalize(path)?)
}
impl Runtime {
    fn load() -> Result<Self> {
        let directory = extract()?;
        let path = directory.join("music_island_dictation.dll");
        // Search only this verified bundle and standard system directories.
        let library = unsafe {
            libloading::os::windows::Library::load_with_flags(&path, 0x00000100 | 0x00000800)?
                .into()
        };
        let library: libloading::Library = library;
        let version: Version = unsafe { *library.get(b"music_island_dictation_abi_version\0")? };
        if unsafe { version() } != ABI_VERSION {
            bail!("Incompatible dictation runtime ABI");
        }
        let call = unsafe { *library.get(b"music_island_dictation_call\0")? };
        let release = unsafe { *library.get(b"music_island_dictation_release\0")? };
        let runtime = Self {
            _library: library,
            call,
            release,
        };
        runtime.call::<Value>(
            &Request::Initialize {
                directory: directory.to_string_lossy().into(),
            },
            &[],
        )?;
        Ok(runtime)
    }
    fn call<T: DeserializeOwned>(&self, request: &Request, audio: &[f32]) -> Result<T> {
        let bytes = serde_json::to_vec(request)?;
        let buffer = unsafe {
            (self.call)(
                ABI_VERSION,
                bytes.as_ptr(),
                bytes.len(),
                audio.as_ptr(),
                audio.len(),
            )
        };
        if buffer.data.is_null() {
            bail!("Dictation runtime returned no response");
        }
        let response = unsafe { std::slice::from_raw_parts(buffer.data, buffer.len).to_vec() };
        unsafe { (self.release)(buffer) };
        let mut envelope: Value =
            serde_json::from_slice(&response).context("Invalid runtime response")?;
        if let Some(error) = envelope.get("error").and_then(Value::as_str) {
            bail!("{error}");
        }
        Ok(serde_json::from_value(
            envelope
                .get_mut("ok")
                .ok_or_else(|| anyhow!("Missing runtime response"))?
                .take(),
        )?)
    }
}
pub fn call<T: DeserializeOwned>(request: &Request, audio: &[f32]) -> Result<T> {
    RUNTIME
        .get_or_init(|| Runtime::load().map_err(|e| format!("{e:#}")))
        .as_ref()
        .map_err(|e| anyhow!(e.clone()))?
        .call(request, audio)
}
pub fn initialize() -> Result<()> {
    let _: Vec<Device> = call(&Request::Devices, &[])?;
    Ok(())
}
pub fn devices() -> Result<Vec<Device>> {
    call(&Request::Devices, &[])
}
pub struct RemoteEngine {
    pub capabilities: Capabilities,
    pub kind: String,
    healthy: std::cell::Cell<bool>,
}
impl RemoteEngine {
    pub fn load(
        path: &Path,
        kind: String,
        accelerator: String,
        device: Option<String>,
        device_index: Option<usize>,
        cpu_only: bool,
    ) -> Result<Self> {
        let capabilities = call(
            &Request::Load {
                path: path.to_string_lossy().into(),
                engine: kind.clone(),
                accelerator,
                device,
                device_index,
                cpu_only,
            },
            &[],
        )?;
        Ok(Self {
            capabilities,
            kind,
            healthy: std::cell::Cell::new(true),
        })
    }
    pub fn is_healthy(&self) -> bool {
        self.healthy.get()
    }
    fn observe<T>(&self, result: Result<T>) -> Result<T> {
        if result.as_ref().is_err_and(|e| {
            e.to_string().contains("worker stopped") || e.to_string().contains("runtime panicked")
        }) {
            self.healthy.set(false);
        }
        result
    }
    pub fn run(&mut self, audio: &[f32], options: RunOptions) -> Result<Text> {
        self.observe(call(
            &Request::Run {
                handle: self.capabilities.handle,
                options,
            },
            audio,
        ))
    }
    pub fn stream(&mut self, options: RunOptions) -> Result<RemoteStream<'_>> {
        self.observe(call::<Value>(
            &Request::Begin {
                handle: self.capabilities.handle,
                options,
            },
            &[],
        ))?;
        Ok(RemoteStream {
            engine: self,
            text: Text::default(),
            finished: false,
        })
    }
}
impl Drop for RemoteEngine {
    fn drop(&mut self) {
        let _ = call::<Value>(
            &Request::Unload {
                handle: self.capabilities.handle,
            },
            &[],
        );
    }
}
pub struct RemoteStream<'a> {
    engine: &'a RemoteEngine,
    text: Text,
    finished: bool,
}
impl RemoteStream<'_> {
    pub fn feed(&mut self, audio: &[f32]) -> Result<Text> {
        self.text = self.engine.observe(call(
            &Request::Feed {
                handle: self.engine.capabilities.handle,
            },
            audio,
        ))?;
        Ok(self.text.clone())
    }
    pub fn finalize(&mut self) -> Result<Text> {
        let result = self.engine.observe(call(
            &Request::Finalize {
                handle: self.engine.capabilities.handle,
            },
            &[],
        ));
        self.finished = true;
        self.text = result?;
        Ok(self.text.clone())
    }
    pub fn text(&self) -> Text {
        self.text.clone()
    }
    pub fn snapshot(&self) -> Text {
        self.text.clone()
    }
    pub fn reset(&mut self) {
        if !self.finished {
            let _ = call::<Value>(
                &Request::Cancel {
                    handle: self.engine.capabilities.handle,
                },
                &[],
            );
            self.finished = true;
        }
    }
}
impl Drop for RemoteStream<'_> {
    fn drop(&mut self) {
        self.reset();
    }
}
pub struct RemoteVad(u64);
impl RemoteVad {
    pub fn new(path: &Path) -> Result<Self> {
        let caps: Capabilities = call(
            &Request::VadLoad {
                path: path.to_string_lossy().into(),
            },
            &[],
        )?;
        Ok(Self(caps.handle))
    }
    pub fn compute(&mut self, frame: &[f32]) -> Result<f32> {
        call(&Request::VadFeed { handle: self.0 }, frame)
    }
    pub fn reset(&mut self) {
        let _ = call::<Value>(&Request::VadReset { handle: self.0 }, &[]);
    }
}
impl Drop for RemoteVad {
    fn drop(&mut self) {
        let _ = call::<Value>(&Request::Unload { handle: self.0 }, &[]);
    }
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Task {
    Transcribe,
    Translate,
}
pub use protocol::RunOptions;
