//! Inference adapter derived from Handy 0.9.7 (MIT, see ../handy-core/LICENSE).
//! Each loaded engine owns one worker. A streaming borrow never crosses FFI
//! or outlives its session, and no Rust allocation is freed by another module.
use anyhow::{anyhow, bail, Result};
use music_island_dictation_protocol::*;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    panic::{catch_unwind, AssertUnwindSafe},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Mutex, OnceLock,
    },
};
use transcribe_cpp::{
    Backend, Feature, Model, ModelOptions, RunExtension, Session, StreamOptions, Task,
    WhisperRunOptions,
};
use transcribe_rs::{
    onnx::{
        canary::CanaryModel,
        cohere::CohereModel,
        gigaam::GigaAMModel,
        moonshine::{MoonshineModel, MoonshineVariant, StreamingModel},
        parakeet::{ParakeetModel, ParakeetParams, TimestampGranularity},
        sense_voice::{SenseVoiceModel, SenseVoiceParams},
        Quantization,
    },
    SpeechModel, TranscribeOptions,
};

enum Engine {
    Cpp(Session),
    Parakeet(ParakeetModel),
    Moonshine(MoonshineModel),
    MoonshineStreaming(StreamingModel),
    SenseVoice(SenseVoiceModel),
    GigaAM(GigaAMModel),
    Canary(CanaryModel),
    Cohere(CohereModel),
    Vad(vad_rs::Vad),
}
struct Command {
    request: Request,
    audio: Vec<f32>,
    reply: mpsc::Sender<Result<Value, String>>,
}
struct Worker {
    sender: mpsc::Sender<Command>,
    thread: std::thread::JoinHandle<()>,
}
static WORKERS: OnceLock<Mutex<HashMap<u64, Worker>>> = OnceLock::new();
static NEXT: AtomicU64 = AtomicU64::new(1);
fn workers() -> &'static Mutex<HashMap<u64, Worker>> {
    WORKERS.get_or_init(Default::default)
}
fn device_id(d: &transcribe_cpp::Device) -> String {
    serde_json::to_string(&(
        d.kind.as_str(),
        if d.device_id.is_some() { "id" } else { "name" },
        d.device_id.as_deref().unwrap_or(&d.name),
    ))
    .unwrap()
}
fn devices() -> Vec<Device> {
    transcribe_cpp::devices()
        .into_iter()
        .map(|d| Device {
            index: d.index,
            id: device_id(&d),
            is_gpu: matches!(
                d.device_type,
                transcribe_cpp::DeviceType::Gpu | transcribe_cpp::DeviceType::Igpu
            ),
            name: if d.description.is_empty() {
                d.name
            } else {
                d.description
            },
            kind: d.kind,
            memory_total: d.memory_total as u64,
        })
        .collect()
}
fn cpp_options(o: &RunOptions) -> transcribe_cpp::RunOptions {
    transcribe_cpp::RunOptions {
        task: if o.target_language.is_some() {
            Task::Translate
        } else {
            Task::Transcribe
        },
        language: o.language.clone(),
        target_language: o.target_language.clone(),
        family: o.initial_prompt.clone().map(|p| {
            RunExtension::Whisper(WhisperRunOptions {
                initial_prompt: Some(p),
                ..Default::default()
            })
        }),
        ..Default::default()
    }
}
fn load(request: &Request) -> Result<(Engine, Capabilities)> {
    let Request::Load {
        path,
        engine,
        accelerator,
        device,
        device_index,
        cpu_only,
    } = request
    else {
        if let Request::VadLoad { path } = request {
            return Ok((
                Engine::Vad(vad_rs::Vad::new(path, 16000).map_err(|e| anyhow!(e.to_string()))?),
                Capabilities::default(),
            ));
        }
        bail!("Invalid load request")
    };
    let path = std::path::Path::new(path);
    // Upstream Windows builds use the baseline ONNX CPU runtime. GPU selection
    // belongs to transcribe-cpp, with CPU fallback and ARM-emulation guard.
    transcribe_rs::accel::set_ort_accelerator(transcribe_rs::accel::OrtAccelerator::CpuOnly);
    let mut caps = Capabilities {
        backend: "onnx".into(),
        ..Default::default()
    };
    let loaded = match engine.as_str() {
        "TranscribeCpp" => {
            let selected = if *cpu_only {
                None
            } else {
                transcribe_cpp::devices().into_iter().find(|d| {
                    device_index.is_some_and(|i| d.index == Some(i))
                        || (accelerator == "gpu"
                            && device.as_ref().is_some_and(|id| *id == device_id(d)))
                })
            };
            if device_index.is_some() && selected.is_none() && !cpu_only {
                bail!("Selected compute device is unavailable");
            }
            let backend = if *cpu_only || accelerator == "cpu" {
                Backend::Cpu
            } else {
                Backend::Auto
            };
            let model = Model::load_with(
                path,
                &ModelOptions {
                    backend,
                    device: selected,
                },
            )?;
            let c = model.capabilities();
            caps.backend = model.backend().to_string();
            caps.arch = model.arch().to_string();
            caps.initial_prompt = model.supports(Feature::InitialPrompt);
            caps.streaming = c.supports_streaming;
            caps.translate = c.supports_translate;
            caps.language_detection = c.supports_language_detect;
            caps.languages = c.languages;
            Engine::Cpp(model.session()?)
        }
        "Parakeet" => Engine::Parakeet(ParakeetModel::load(path, &Quantization::Int8)?),
        "Moonshine" => Engine::Moonshine(MoonshineModel::load(
            path,
            MoonshineVariant::Base,
            &Quantization::default(),
        )?),
        "MoonshineStreaming" => {
            Engine::MoonshineStreaming(StreamingModel::load(path, 0, &Quantization::default())?)
        }
        "SenseVoice" => Engine::SenseVoice(SenseVoiceModel::load(path, &Quantization::Int8)?),
        "GigaAM" => Engine::GigaAM(GigaAMModel::load(path, &Quantization::Int8)?),
        "Canary" => Engine::Canary(CanaryModel::load(path, &Quantization::Int8)?),
        "Cohere" => Engine::Cohere(CohereModel::load(path, &Quantization::Int8)?),
        _ => bail!("Unknown inference engine"),
    };
    Ok((loaded, caps))
}
fn run(engine: &mut Engine, audio: &[f32], o: &RunOptions) -> Result<Text> {
    let options = TranscribeOptions {
        language: o.language.clone(),
        translate: o.translate,
        ..Default::default()
    };
    let mut language = None;
    let full = match engine {
        Engine::Cpp(session) => {
            let r = session.run(audio, &cpp_options(o))?;
            language = r.language;
            r.text
        }
        Engine::Parakeet(e) => {
            e.transcribe_with(
                audio,
                &ParakeetParams {
                    timestamp_granularity: Some(TimestampGranularity::Segment),
                    ..Default::default()
                },
            )?
            .text
        }
        Engine::Moonshine(e) => e.transcribe(audio, &TranscribeOptions::default())?.text,
        Engine::MoonshineStreaming(e) => e.transcribe(audio, &TranscribeOptions::default())?.text,
        Engine::SenseVoice(e) => {
            e.transcribe_with(
                audio,
                &SenseVoiceParams {
                    language: o.language.clone(),
                    use_itn: Some(true),
                },
            )?
            .text
        }
        Engine::GigaAM(e) => e.transcribe(audio, &TranscribeOptions::default())?.text,
        Engine::Canary(e) => e.transcribe(audio, &options)?.text,
        Engine::Cohere(e) => e.transcribe(audio, &options)?.text,
        Engine::Vad(_) => bail!("VAD is not a transcription model"),
    };
    Ok(Text {
        full,
        language,
        ..Default::default()
    })
}
fn stream(
    session: &mut Session,
    options: RunOptions,
    begin_reply: mpsc::Sender<Result<Value, String>>,
    rx: &mpsc::Receiver<Command>,
) {
    let run_options = cpp_options(&options);
    let mut stream = match session.stream(&run_options, &StreamOptions::default()) {
        Ok(s) => s,
        Err(e) => {
            let _ = begin_reply.send(Err(e.to_string()));
            return;
        }
    };
    let _ = begin_reply.send(Ok(Value::Null));
    while let Ok(cmd) = rx.recv() {
        let finish = matches!(
            cmd.request,
            Request::Finalize { .. } | Request::Cancel { .. }
        );
        let result = (|| -> Result<Value> {
            let u = match cmd.request {
                Request::Feed { .. } => stream.feed(&cmd.audio)?,
                Request::Finalize { .. } => stream.finalize()?,
                Request::Cancel { .. } => {
                    stream.reset();
                    return Ok(Value::Null);
                }
                _ => bail!("Engine is streaming"),
            };
            let text = stream.text();
            Ok(serde_json::to_value(Text {
                full: text.full,
                committed: text.committed,
                tentative: text.tentative,
                language: if finish {
                    stream.snapshot().language
                } else {
                    None
                },
                revision: u.revision as u64,
                input_received_ms: u.input_received_ms as f64,
                audio_committed_ms: u.audio_committed_ms as f64,
                buffered_ms: u.buffered_ms as f64,
                committed_changed: u.committed_changed,
                tentative_changed: u.tentative_changed,
            })?)
        })();
        let _ = cmd.reply.send(result.map_err(|e| e.to_string()));
        if finish {
            break;
        }
    }
}
fn worker(
    request: Request,
    rx: mpsc::Receiver<Command>,
    ready: mpsc::Sender<Result<Capabilities, String>>,
    handle: u64,
) {
    let (mut engine, mut caps) = match load(&request) {
        Ok(e) => e,
        Err(e) => {
            let _ = ready.send(Err(e.to_string()));
            return;
        }
    };
    caps.handle = handle;
    let _ = ready.send(Ok(caps));
    while let Ok(cmd) = rx.recv() {
        if let Request::Begin { options, .. } = &cmd.request {
            match &mut engine {
                Engine::Cpp(session) => stream(session, options.clone(), cmd.reply, &rx),
                _ => {
                    let _ = cmd
                        .reply
                        .send(Err("Model does not support streaming".into()));
                }
            }
            continue;
        }
        let result = (|| -> Result<Value> {
            match cmd.request {
                Request::Run { options, .. } => Ok(serde_json::to_value(run(
                    &mut engine,
                    &cmd.audio,
                    &options,
                )?)?),
                Request::VadFeed { .. } => match &mut engine {
                    Engine::Vad(v) => Ok(json!(
                        v.compute(&cmd.audio)
                            .map_err(|e| anyhow!(e.to_string()))?
                            .prob
                    )),
                    _ => bail!("Not a VAD"),
                },
                Request::VadReset { .. } => match &mut engine {
                    Engine::Vad(v) => {
                        v.reset();
                        Ok(Value::Null)
                    }
                    _ => bail!("Not a VAD"),
                },
                _ => bail!("Invalid engine operation"),
            }
        })();
        let _ = cmd.reply.send(result.map_err(|e| e.to_string()));
    }
}
fn dispatch(request: Request, audio: &[f32]) -> Result<Value> {
    match request {
        Request::Initialize { directory } => {
            transcribe_cpp::init_logging();
            transcribe_cpp::init_backends(&directory)?;
            Ok(json!({"abi":ABI_VERSION}))
        }
        Request::Devices => Ok(serde_json::to_value(devices())?),
        Request::Load { .. } | Request::VadLoad { .. } => {
            let handle = NEXT.fetch_add(1, Ordering::Relaxed);
            let (tx, rx) = mpsc::channel();
            let (ready_tx, ready_rx) = mpsc::channel();
            let thread = std::thread::Builder::new()
                .name(format!("dictation-engine-{handle}"))
                .spawn(move || {
                    let _ =
                        catch_unwind(AssertUnwindSafe(|| worker(request, rx, ready_tx, handle)));
                })?;
            let caps = ready_rx
                .recv()
                .map_err(|_| anyhow!("Inference worker stopped while loading"))?
                .map_err(|e| anyhow!(e))?;
            workers()
                .lock()
                .map_err(|_| anyhow!("Runtime lock poisoned"))?
                .insert(handle, Worker { sender: tx, thread });
            Ok(serde_json::to_value(caps)?)
        }
        Request::Unload { handle } => {
            let worker = workers()
                .lock()
                .map_err(|_| anyhow!("Runtime lock poisoned"))?
                .remove(&handle);
            if let Some(worker) = worker {
                drop(worker.sender);
                let _ = worker.thread.join();
            }
            Ok(Value::Null)
        }
        request => {
            let handle = match &request {
                Request::Run { handle, .. }
                | Request::Begin { handle, .. }
                | Request::Feed { handle }
                | Request::Finalize { handle }
                | Request::Cancel { handle }
                | Request::VadFeed { handle }
                | Request::VadReset { handle } => *handle,
                _ => unreachable!(),
            };
            let tx = workers()
                .lock()
                .map_err(|_| anyhow!("Runtime lock poisoned"))?
                .get(&handle)
                .map(|worker| worker.sender.clone())
                .ok_or_else(|| anyhow!("Engine has been unloaded"))?;
            let (reply, rx) = mpsc::channel();
            tx.send(Command {
                request,
                audio: audio.to_vec(),
                reply,
            })
            .map_err(|_| anyhow!("Inference worker stopped"))?;
            rx.recv()
                .map_err(|_| anyhow!("Inference worker stopped"))?
                .map_err(|e| anyhow!(e))
        }
    }
}
#[no_mangle]
pub extern "C" fn music_island_dictation_abi_version() -> u32 {
    ABI_VERSION
}
#[no_mangle]
pub unsafe extern "C" fn music_island_dictation_call(
    version: u32,
    request: *const u8,
    len: usize,
    audio: *const f32,
    samples: usize,
) -> Buffer {
    let result = catch_unwind(AssertUnwindSafe(|| -> Result<Value> {
        if version != ABI_VERSION
            || request.is_null()
            || len > 1024 * 1024
            || (samples > 0 && audio.is_null())
            || samples > 500_000_000
        {
            bail!("Invalid ABI request");
        }
        let request = serde_json::from_slice(std::slice::from_raw_parts(request, len))?;
        let audio = if samples == 0 {
            &[]
        } else {
            std::slice::from_raw_parts(audio, samples)
        };
        dispatch(request, audio)
    }))
    .unwrap_or_else(|_| Err(anyhow!("Inference runtime panicked")));
    let response = match result {
        Ok(value) => json!({"ok":value}),
        Err(error) => json!({"error":error.to_string()}),
    };
    let mut bytes = serde_json::to_vec(&response).unwrap().into_boxed_slice();
    let buffer = Buffer {
        data: bytes.as_mut_ptr(),
        len: bytes.len(),
    };
    std::mem::forget(bytes);
    buffer
}
#[no_mangle]
pub unsafe extern "C" fn music_island_dictation_release(buffer: Buffer) {
    if !buffer.data.is_null() {
        drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(
            buffer.data,
            buffer.len,
        )));
    }
}
