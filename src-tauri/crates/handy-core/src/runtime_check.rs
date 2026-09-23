//! Explicit CLI acceptance probe; never opened during normal application launch.
use anyhow::{bail, Result};
use serde_json::{json, Value};
use std::{path::Path, time::Instant};
pub fn run(model: Option<&Path>, audio: Option<&Path>) -> Result<Value> {
    crate::portable::init();
    crate::portable::extract_resources()?;
    let started = Instant::now();
    crate::runtime::initialize()?;
    let mut report = json!({"abi":1,"devices":crate::runtime::devices()?,"initializeMs":started.elapsed().as_millis()});
    let mut vad = crate::runtime::RemoteVad::new(
        &crate::portable::resources().join("resources/models/silero_vad_v4.onnx"),
    )?;
    for _ in 0..4 {
        let probability = vad.compute(&[0.0; 480])?;
        if !(0.0..=1.0).contains(&probability) {
            bail!("Invalid VAD probability")
        }
    }
    vad.reset();
    drop(vad);
    report["vad"] = "passed".into();
    if let (Some(model), Some(audio)) = (model, audio) {
        let mut wave = hound::WavReader::open(audio)?;
        if wave.spec().sample_rate != 16000
            || wave.spec().channels != 1
            || wave.spec().bits_per_sample != 16
        {
            bail!("Probe requires mono 16 kHz signed 16-bit WAV")
        }
        let samples: Vec<f32> = wave
            .samples::<i16>()
            .map(|s| s.map(|n| n as f32 / 32768.0))
            .collect::<Result<_, _>>()?;
        let start = Instant::now();
        let mut engine = crate::runtime::RemoteEngine::load(
            model,
            "TranscribeCpp".into(),
            "cpu".into(),
            None,
            None,
            true,
        )?;
        report["loadMs"] = json!(start.elapsed().as_millis());
        let start = Instant::now();
        let result = engine.run(&samples, Default::default())?;
        report["recognizeMs"] = json!(start.elapsed().as_millis());
        report["audioSeconds"] = json!(samples.len() as f64 / 16000.0);
        report["text"] = json!(result.full);
        drop(engine);
        report["unloaded"] = true.into();
    }
    Ok(report)
}
