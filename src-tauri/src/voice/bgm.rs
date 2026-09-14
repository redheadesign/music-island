//! BGM capture stub — not exposed in Music Island voice embed (no shipping call sites).
#![allow(dead_code)]

use crossbeam_channel::Sender;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

pub fn bgm_process_loop(
    running: Arc<AtomicBool>,
    _sender: Sender<Vec<i16>>,
    _pid: u32,
    _skip_rate: Arc<AtomicU32>,
) -> Result<(), String> {
    while running.load(Ordering::Acquire) {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    Ok(())
}

pub fn list_audio_processes() -> Result<Vec<(String, String, u32)>, String> {
    Ok(Vec::new())
}
