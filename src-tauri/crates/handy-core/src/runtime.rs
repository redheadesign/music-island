//! Versioned C ABI client. No Tauri, Rust object or allocator crosses the DLL.
use crate::embedded_assets::EmbeddedAsset;
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
pub(crate) use crate::embedded_assets::checked_directory;
fn extract() -> Result<PathBuf> {
    if RUNTIME_FILES.is_empty() {
        bail!("This development build has no dictation engine. Run npm run dictation:bundle, then rebuild.");
    }
    let mut digest = Sha256::new();
    for asset in RUNTIME_FILES {
        digest.update(asset.name);
        digest.update(asset.sha256);
    }
    let version = format!("abi{}-{:x}", ABI_VERSION, digest.finalize());
    let path = crate::portable::resources().join(version);
    crate::embedded_assets::extract_assets(RUNTIME_FILES, &path)?;
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
    gpu_lost: std::cell::Cell<bool>,
    load_request: Request,
    owned_handle: Option<u64>,
}

fn backend_failure(error: &str) -> bool {
    error.starts_with("[backend-lost]") || error.starts_with("[backend-oom]")
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
        let load_request = Request::Load {
            path: path.to_string_lossy().into(),
            engine: kind.clone(),
            accelerator,
            device,
            device_index,
            cpu_only,
        };
        let capabilities: Capabilities = call(&load_request, &[])?;
        Ok(Self {
            owned_handle: Some(capabilities.handle),
            capabilities,
            kind,
            healthy: std::cell::Cell::new(true),
            gpu_lost: std::cell::Cell::new(false),
            load_request,
        })
    }
    pub fn is_healthy(&self) -> bool {
        self.healthy.get()
    }
    fn observe<T>(&self, result: Result<T>) -> Result<T> {
        if let Err(error) = &result {
            let message = error.to_string();
            if backend_failure(&message)
                && self
                    .capabilities
                    .backend
                    .to_ascii_lowercase()
                    .starts_with("vulkan")
            {
                self.gpu_lost.set(true);
            } else if backend_failure(&message)
                || message.contains("worker stopped")
                || message.contains("runtime panicked")
            {
                self.healthy.set(false);
            }
        }
        result
    }
    fn release_handle(&mut self) {
        if let Some(handle) = self.owned_handle.take() {
            let _ = call::<Value>(&Request::Unload { handle }, &[]);
        }
    }
    fn reopen(&mut self, cpu_only: bool) -> Result<()> {
        self.release_handle();
        self.healthy.set(false);
        if cpu_only {
            if let Request::Load {
                accelerator,
                device,
                device_index,
                cpu_only,
                ..
            } = &mut self.load_request
            {
                *accelerator = "cpu".into();
                *device = None;
                *device_index = None;
                *cpu_only = true;
            }
        }
        self.capabilities = call(&self.load_request, &[])?;
        self.owned_handle = Some(self.capabilities.handle);
        self.healthy.set(true);
        self.gpu_lost.set(false);
        Ok(())
    }
    fn run_once(&self, audio: &[f32], options: RunOptions) -> Result<Text> {
        self.observe(call(
            &Request::Run {
                handle: self.capabilities.handle,
                options,
            },
            audio,
        ))
    }
    pub fn run(&mut self, audio: &[f32], options: RunOptions) -> Result<Text> {
        if !self.gpu_lost.get() {
            let result = self.run_once(audio, options.clone());
            if !self.gpu_lost.get() {
                return result;
            }
        }
        // A complete buffered recording can be replayed after a driver reset.
        // Stream packets are never replayed separately.
        log::warn!("Dictation GPU session failed; retrying with a fresh session");
        if self.reopen(false).is_ok() {
            let result = self.run_once(audio, options.clone());
            if !self.gpu_lost.get() {
                return result;
            }
        }
        log::warn!("Dictation GPU recovery failed; recognizing buffered audio on CPU");
        self.reopen(true)?;
        self.run_once(audio, options)
    }
    pub fn stream(&mut self, options: RunOptions) -> Result<RemoteStream<'_>> {
        if self.gpu_lost.get() {
            self.reopen(false).or_else(|_| self.reopen(true))?;
        }
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
        self.release_handle();
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

#[cfg(test)]
mod tests {
    use super::*;

    fn engine(backend: &str) -> RemoteEngine {
        RemoteEngine {
            capabilities: Capabilities {
                backend: backend.into(),
                ..Default::default()
            },
            kind: "TranscribeCpp".into(),
            healthy: true.into(),
            gpu_lost: false.into(),
            owned_handle: None,
            load_request: Request::Devices,
        }
    }

    #[test]
    fn only_a_lost_gpu_session_marks_the_recording_for_replay() {
        let gpu = engine("Vulkan0");
        let _ = gpu.observe::<()>(Err(anyhow!("unsupported language")));
        assert!(!gpu.gpu_lost.get());
        for error in [
            "[backend-lost] device removed",
            "[backend-oom] out of memory",
        ] {
            let gpu = engine("Vulkan0");
            let _ = gpu.observe::<()>(Err(anyhow!(error)));
            assert!(gpu.gpu_lost.get());
            assert!(gpu.is_healthy()); // Keep the leased engine for batch replay.
            let cpu = engine("cpu");
            let _ = cpu.observe::<()>(Err(anyhow!(error)));
            assert!(!cpu.gpu_lost.get());
            assert!(!cpu.is_healthy());
        }
    }
}
