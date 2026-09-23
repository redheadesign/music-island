//! Only C scalars and borrowed byte/sample slices cross the DLL boundary.
//! The DLL owns response buffers and exposes a matching release function.
use serde::{Deserialize, Serialize};
pub const ABI_VERSION: u32 = 1;
#[repr(C)]
pub struct Buffer {
    pub data: *mut u8,
    pub len: usize,
}
pub type Call = unsafe extern "C" fn(u32, *const u8, usize, *const f32, usize) -> Buffer;
pub type Release = unsafe extern "C" fn(Buffer);
pub type Version = unsafe extern "C" fn() -> u32;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(tag = "operation", rename_all = "snake_case")]
pub enum Request {
    Initialize {
        directory: String,
    },
    Devices,
    Load {
        path: String,
        engine: String,
        accelerator: String,
        device: Option<String>,
        device_index: Option<usize>,
        cpu_only: bool,
    },
    Unload {
        handle: u64,
    },
    Run {
        handle: u64,
        options: RunOptions,
    },
    Begin {
        handle: u64,
        options: RunOptions,
    },
    Feed {
        handle: u64,
    },
    Finalize {
        handle: u64,
    },
    Cancel {
        handle: u64,
    },
    VadLoad {
        path: String,
    },
    VadFeed {
        handle: u64,
    },
    VadReset {
        handle: u64,
    },
}
#[derive(Default, Serialize, Deserialize, Clone, Debug)]
pub struct RunOptions {
    pub language: Option<String>,
    pub target_language: Option<String>,
    pub initial_prompt: Option<String>,
    pub translate: bool,
}
#[derive(Default, Serialize, Deserialize, Clone, Debug)]
pub struct Capabilities {
    pub handle: u64,
    pub backend: String,
    pub arch: String,
    pub initial_prompt: bool,
    pub streaming: bool,
    pub translate: bool,
    pub language_detection: bool,
    pub languages: Vec<String>,
}
#[derive(Default, Serialize, Deserialize, Clone, Debug)]
pub struct Text {
    pub full: String,
    pub committed: String,
    pub tentative: String,
    pub language: Option<String>,
    pub revision: u64,
    pub input_received_ms: f64,
    pub audio_committed_ms: f64,
    pub buffered_ms: f64,
    pub committed_changed: bool,
    pub tentative_changed: bool,
}
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Device {
    pub index: Option<usize>,
    pub id: String,
    pub name: String,
    pub kind: String,
    pub is_gpu: bool,
    pub memory_total: u64,
}
