//! Optional look-ahead on post-VAD PCM. Capture always retains its own complete
//! recording. A slow decoder, cancellation, or a changed model can only reduce
//! the amount of work reused by the final offline pass.
use crate::long_form_gigaam::SealedPause;
use music_island_dictation_protocol::{RunOptions, Text};
use sha2::{Digest, Sha256};
use std::{
    collections::VecDeque,
    ops::Range,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
};

pub(crate) fn enabled(preference: bool) -> bool {
    resolve_preference(preference, std::env::var("MUSIC_ISLAND_GIGAAM_PREDECODE").ok().as_deref())
}

fn resolve_preference(preference: bool, process_override: Option<&str>) -> bool {
    match process_override {
        Some("1") => true,
        Some("0") => false,
        _ => preference,
    }
}

pub(crate) fn supported(architecture: Option<&str>, streaming: bool) -> bool {
    architecture == Some("gigaam") && !streaming
}

// A 30 ms VAD frame is typical. Bound both the queued frames and the PCM
// accumulated while waiting for a real pause in continuous speech.
const QUEUED_FRAMES: usize = 256;
const MAX_FRAME: usize = 16_000;
const MAX_PENDING: usize = 90 * 16_000;

struct Decoded {
    range: Range<usize>,
    audio_hash: [u8; 32],
    handle: u64,
    options: RunOptions,
    text: Text,
}

#[derive(Default)]
pub(crate) struct Cache {
    chunks: VecDeque<Decoded>,
}

impl Cache {
    pub(crate) fn take(
        &mut self,
        range: &Range<usize>,
        pcm: &[f32],
        handle: u64,
        options: &RunOptions,
    ) -> Option<Text> {
        let chunk = self.chunks.front()?;
        if chunk.range != *range
            || chunk.handle != handle
            || &chunk.options != options
            || chunk.audio_hash != hash_pcm(pcm)
        {
            self.chunks.clear();
            return None;
        }
        Some(self.chunks.pop_front()?.text)
    }
}

fn hash_pcm(pcm: &[f32]) -> [u8; 32] {
    Sha256::digest(bytemuck::cast_slice::<f32, u8>(pcm)).into()
}

struct Session {
    operation: u64,
    sender: Option<mpsc::SyncSender<Vec<f32>>>,
    stopping: Arc<AtomicBool>,
    worker: thread::JoinHandle<Cache>,
}

#[derive(Default)]
pub(crate) struct Router {
    accepting: AtomicBool,
    running: Arc<AtomicBool>,
    session: Mutex<Option<Session>>,
}

struct WorkerGuard(Arc<AtomicBool>);

impl Drop for WorkerGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

impl Router {
    pub(crate) fn start(
        &self,
        operation: u64,
        decode: impl Fn(&[f32]) -> Option<(u64, RunOptions, Text)> + Send + 'static,
    ) {
        let mut slot = self.session.lock().unwrap_or_else(|e| e.into_inner());
        if self.running.swap(true, Ordering::AcqRel) {
            return;
        }
        let (sender, audio) = mpsc::sync_channel::<Vec<f32>>(QUEUED_FRAMES);
        let stopping = Arc::new(AtomicBool::new(false));
        let worker_stop = Arc::clone(&stopping);
        let guard = WorkerGuard(Arc::clone(&self.running));
        let worker = thread::Builder::new()
            .name("gigaam-predecode".into())
            .spawn(move || {
                let _guard = guard;
                let mut cache = Cache::default();
                let mut planner = SealedPause::default();
                let mut pending = Vec::new();
                let mut start = 0;
                while let Ok(frame) = audio.recv() {
                    if worker_stop.load(Ordering::Acquire)
                        || pending.len() + frame.len() > MAX_PENDING
                    {
                        break;
                    }
                    pending.extend_from_slice(&frame);
                    while let Some(length) = planner.next(&pending) {
                        if worker_stop.load(Ordering::Acquire) {
                            return cache;
                        }
                        let pcm = &pending[..length];
                        let Some((handle, options, text)) = decode(pcm) else {
                            return cache;
                        };
                        cache.chunks.push_back(Decoded {
                            range: start..start + length,
                            audio_hash: hash_pcm(pcm),
                            handle,
                            options,
                            text,
                        });
                        pending.drain(..length);
                        start += length;
                    }
                }
                cache
            });
        let Ok(worker) = worker else {
            log::warn!("Could not start optional GigaAM predecode worker");
            return;
        };
        *slot = Some(Session {
            operation,
            sender: Some(sender),
            stopping,
            worker,
        });
        self.accepting.store(true, Ordering::Release);
    }

    pub(crate) fn feed(&self, frame: &[f32]) {
        if !self.accepting.load(Ordering::Acquire) {
            return;
        }
        let mut slot = self.session.lock().unwrap_or_else(|e| e.into_inner());
        let Some(session) = slot.as_mut() else { return };
        if let Some(sender) = &session.sender {
            if frame.len() <= MAX_FRAME && sender.try_send(frame.to_vec()).is_ok() {
                return;
            }
            // A gap invalidates all future offsets. Retain previously decoded
            // chunks only and let the normal final path cover the rest.
            self.accepting.store(false, Ordering::Release);
            session.stopping.store(true, Ordering::Release);
            session.sender.take();
        }
    }

    pub(crate) fn cancel(&self) {
        let mut slot = self.session.lock().unwrap_or_else(|e| e.into_inner());
        self.accepting.store(false, Ordering::Release);
        if let Some(mut session) = slot.take() {
            session.stopping.store(true, Ordering::Release);
            session.sender.take();
        }
    }

    pub(crate) fn finish(&self, operation: u64) -> Cache {
        let mut slot = self.session.lock().unwrap_or_else(|e| e.into_inner());
        if slot.as_ref().is_none_or(|s| s.operation != operation) {
            return Cache::default();
        }
        self.accepting.store(false, Ordering::Release);
        let mut session = slot.take().unwrap();
        session.stopping.store(true, Ordering::Release);
        session.sender.take();
        drop(slot);
        session.worker.join().unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn persisted_preference_survives_reload_and_benchmark_can_override_either_way() {
        use crate::settings::{get_default_settings, AppSettings};

        let mut profile = serde_json::to_value(get_default_settings()).unwrap();
        assert_eq!(profile["gigaam_background_recognition"], false);
        profile.as_object_mut().unwrap().remove("gigaam_background_recognition");
        let mut settings: AppSettings = serde_json::from_value(profile).unwrap();
        assert!(!resolve_preference(settings.gigaam_background_recognition, None));

        settings.gigaam_background_recognition = true;
        let saved = serde_json::to_vec(&settings).unwrap();
        let restored: AppSettings = serde_json::from_slice(&saved).unwrap();
        assert!(resolve_preference(restored.gigaam_background_recognition, None));
        assert!(!resolve_preference(restored.gigaam_background_recognition, Some("0")));
        assert!(resolve_preference(false, Some("1")));
        assert!(resolve_preference(true, Some("invalid")));
    }

    fn fixture() -> Vec<f32> {
        let mut audio = vec![0.2; 28 * 16_000];
        audio[16 * 16_000..16 * 16_000 + 4_800].fill(0.0);
        audio
    }

    fn send_audio(router: &Router, audio: &[f32]) {
        for frame in audio.chunks(16_000) {
            router.feed(frame);
        }
    }

    fn text() -> (u64, RunOptions, Text) {
        (
            21,
            RunOptions::default(),
            Text {
                full: "тест".into(),
                ..Default::default()
            },
        )
    }

    #[test]
    fn final_reuses_only_same_pcm_and_options_for_same_model() {
        let pcm = fixture();
        let range = crate::long_form_gigaam::pause_ranges(&pcm)
            .unwrap()
            .remove(0);
        for change in 0..4 {
            let router = Router::default();
            let (decoded, ready) = mpsc::channel();
            router.start(3, move |_| {
                decoded.send(()).unwrap();
                Some(text())
            });
            send_audio(&router, &pcm);
            ready.recv_timeout(Duration::from_secs(5)).unwrap();
            assert!(router.finish(2).chunks.is_empty());
            let mut cached = router.finish(3);
            assert_eq!(cached.chunks.len(), 1);
            let mut audio = pcm[range.clone()].to_vec();
            if change == 1 {
                audio[3] += 0.05;
            }
            let handle = if change == 2 { 22 } else { 21 };
            let options = RunOptions {
                translate: change == 3,
                ..Default::default()
            };
            assert_eq!(
                cached
                    .take(&range, &audio, handle, &options)
                    .map(|r| r.full),
                (change == 0).then(|| "тест".to_owned())
            );
        }
    }

    #[test]
    fn cancelled_inference_never_supplies_a_new_recording_or_starts_a_second_worker() {
        let router = Router::default();
        let (entered, started) = mpsc::channel();
        let (release, blocked) = mpsc::channel();
        let blocked = Mutex::new(blocked);
        router.start(5, move |_| {
            entered.send(()).unwrap();
            blocked
                .lock()
                .unwrap()
                .recv_timeout(Duration::from_secs(5))
                .unwrap();
            Some(text())
        });
        send_audio(&router, &fixture());
        started.recv_timeout(Duration::from_secs(5)).unwrap();
        router.cancel();
        router.start(6, |_| panic!("a second engine call began"));
        assert!(!router.accepting.load(Ordering::Acquire));
        assert!(router.finish(5).chunks.is_empty());
        assert!(router.finish(6).chunks.is_empty());
        release.send(()).unwrap();
        let deadline = Instant::now() + Duration::from_secs(4);
        while router.running.load(Ordering::Acquire) && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(2));
        }
        assert!(!router.running.load(Ordering::Acquire));
        router.start(7, |_| Some(text()));
        assert!(router.accepting.load(Ordering::Acquire));
        assert!(router.finish(7).chunks.is_empty());
    }

    #[test]
    fn discontinuity_disables_future_reuse_and_short_recordings_do_no_inference() {
        let router = Router::default();
        router.start(1, |_| panic!("a short recording reached the engine"));
        router.feed(&[0.0; 128]);
        router.feed(&vec![0.0; MAX_FRAME + 1]);
        assert!(!router.accepting.load(Ordering::Acquire));
        send_audio(&router, &fixture());
        assert!(router.finish(1).chunks.is_empty());
    }
}
