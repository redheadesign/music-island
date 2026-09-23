//! One exit path. Never join audio/model threads on the Windows event loop.
use std::sync::atomic::{AtomicU8, Ordering};
use std::time::Duration;
use tauri::{Emitter, Manager};

const RUNNING: u8 = 0;
const STOPPING: u8 = 1;
const READY: u8 = 2;
static PHASE: AtomicU8 = AtomicU8::new(RUNNING);

fn begin(phase: &AtomicU8) -> bool {
    phase.compare_exchange(RUNNING, STOPPING, Ordering::AcqRel, Ordering::Acquire).is_ok()
}

pub fn is_stopping() -> bool { PHASE.load(Ordering::Acquire) != RUNNING }
pub fn ready_to_exit() -> bool { PHASE.load(Ordering::Acquire) == READY }

pub fn request(app: &tauri::AppHandle) {
    if !begin(&PHASE) { return; }
    crate::logging::append_event("shutdown: requested");
    let _ = app.emit("app:shutdown", ());
    let (done_tx, done_rx) = std::sync::mpsc::channel();
    let worker_app = app.clone();
    std::thread::spawn(move || {
        // Run independently: a stuck recognizer must not keep the other microphone open.
        let voice_app = worker_app.clone();
        let voice = std::thread::spawn(move || {
            if let Some(state) = voice_app.try_state::<crate::voice::VoiceEngineState>() {
                state.engine.lock().stop();
            }
            crate::logging::append_event("shutdown: voice stopped");
        });
        handy_core::shutdown(&worker_app);
        crate::logging::append_event("shutdown: dictation stopped");
        let _ = voice.join();
        let _ = done_tx.send(());
    });
    let exit_app = app.clone();
    std::thread::spawn(move || {
        if done_rx.recv_timeout(Duration::from_secs(8)).is_err() {
            crate::logging::append_event("shutdown: worker deadline exceeded; requesting process exit");
        } else {
            crate::logging::append_event("shutdown: resources released");
        }
        PHASE.store(READY, Ordering::Release);
        exit_app.exit(0);
        // Covers a broken Windows event loop or a blocked destructor, only in our process.
        std::thread::sleep(Duration::from_secs(2));
        crate::logging::append_event("shutdown: event loop deadline exceeded; forced exit");
        std::process::exit(0);
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeated_and_concurrent_exit_requests_start_one_cleanup() {
        let phase = AtomicU8::new(RUNNING);
        std::thread::scope(|scope| {
            let jobs: Vec<_> = (0..16).map(|_| scope.spawn(|| begin(&phase))).collect();
            assert_eq!(jobs.into_iter().map(|job| job.join().unwrap()).filter(|started| *started).count(), 1);
        });
        phase.store(READY, Ordering::Release);
        assert!(!begin(&phase));
    }
}
