//! CPU inference for the official GigaAM Zapformer RNN-T full-context and
//! cached 320 ms exports. Graph ordering follows GigaAM's onnx_utils.py.
mod features;
mod streaming;

use anyhow::{anyhow, bail, ensure, Context, Result};
use features::Features;
use ort::{
    session::{Session, SessionInputValue},
    value::{DynValue, Tensor},
};
use sentencepiece_rs::SentencePieceProcessor;
use serde::Deserialize;
use std::{
    fs,
    path::{Component, Path, PathBuf},
};
use streaming::{StreamGraphs, StreamSpec};

#[derive(Deserialize)]
struct ModelSpec {
    version: u8,
    model: String,
    languages: Vec<String>,
    whole: String,
    advance: String,
    head_index: usize,
    tokenizer: String,
    n_fft: usize,
    hop_length: usize,
    n_mels: usize,
    window: String,
    filters: String,
    stream_manifest: Option<String>,
    blank_ids: Vec<i64>,
    pred_hidden: usize,
}

/// Package filenames are plain basenames, as in the upstream ONNX exports.
fn asset(root: &Path, name: &str) -> Result<PathBuf> {
    let mut parts = Path::new(name).components();
    ensure!(
        matches!(parts.next(), Some(Component::Normal(_))) && parts.next().is_none(),
        "Invalid GigaAM asset name {name:?}"
    );
    let path = root.join(name);
    ensure!(path.is_file(), "GigaAM package is missing {name}");
    Ok(path)
}

fn read_weights(root: &Path, name: &str, count: usize) -> Result<Vec<f32>> {
    let path = asset(root, name)?;
    ensure!(
        fs::metadata(&path)?.len() == (count * 4) as u64,
        "Invalid dimensions in {name}"
    );
    Ok(fs::read(path)?
        .chunks_exact(4)
        .map(|bytes| f32::from_le_bytes(bytes.try_into().unwrap()))
        .collect())
}

fn session(root: &Path, name: &str) -> Result<Session> {
    let path = asset(root, name)?;
    let threads =
        std::thread::available_parallelism().map_or(1, |v| v.get().saturating_sub(1).clamp(1, 4));
    let mut builder = Session::builder()?
        .with_intra_threads(threads)
        .map_err(|e| anyhow!(e.to_string()))?
        .with_inter_threads(1)
        .map_err(|e| anyhow!(e.to_string()))?
        .with_intra_op_spinning(false)
        .map_err(|e| anyhow!(e.to_string()))?
        .with_inter_op_spinning(false)
        .map_err(|e| anyhow!(e.to_string()))?;
    Ok(builder
        .commit_from_file(path)
        .with_context(|| format!("Loading GigaAM graph {name}"))?)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The two reference transcripts come from official full-context and 320ms
    /// decoders respectively; the model and speech are supplied by local QA.
    #[test]
    #[ignore = "requires the exported GigaAM model, reference speech and goldens"]
    fn windows_real_model_batch_stream_and_reset() -> Result<()> {
        let env = |key| std::env::var(key).with_context(|| format!("Missing {key}"));
        let directory = env("MUSIC_ISLAND_GIGAAM_TEST_MODEL")?;
        let mut reader = hound::WavReader::open(env("MUSIC_ISLAND_GIGAAM_TEST_WAV")?)?;
        let spec = reader.spec();
        ensure!(
            spec.channels == 1
                && spec.sample_rate == 16000
                && spec.bits_per_sample == 16
                && spec.sample_format == hound::SampleFormat::Int,
            "Expected mono signed PCM16 at 16 kHz"
        );
        let pcm = reader
            .samples::<i16>()
            .map(|sample| sample.map(|v| v as f32 / 32768.))
            .collect::<std::result::Result<Vec<_>, _>>()?;
        let mut model = Zapformer::load(Path::new(&directory), true)?;
        let expected_batch = env("MUSIC_ISLAND_GIGAAM_TEST_BATCH")?;
        ensure!(!expected_batch.trim().is_empty(), "Expected audible speech");
        assert_eq!(model.batch(&pcm, None)?, expected_batch);
        let expected_stream = env("MUSIC_ISLAND_GIGAAM_TEST_STREAM")?;
        {
            let mut cancelled = model.begin(None)?;
            cancelled.feed(&pcm[..pcm.len().min(10000)], false)?;
        }
        for chunk_size in [287, 6473] {
            let mut stream = model.begin(None)?;
            for block in pcm.chunks(chunk_size) {
                stream.feed(block, false)?;
            }
            let result = stream.feed(&[], true)?;
            assert_eq!(result.full, expected_stream);
            assert_eq!(result.buffered_ms, 0.0);
        }
        assert!(model.begin(None)?.feed(&[], true)?.full.is_empty());
        Ok(())
    }
}

fn has_input(session: &Session, name: &str) -> bool {
    session.inputs().iter().any(|node| node.name() == name)
}

fn run_graph(session: &mut Session, inputs: &[SessionInputValue<'_>]) -> Result<Vec<DynValue>> {
    ensure!(
        inputs.len() == session.inputs().len(),
        "Unexpected input count for GigaAM graph"
    );
    Ok(session
        .run(inputs)?
        .into_iter()
        .map(|(_, output)| output)
        .collect())
}

fn outputs<const N: usize>(values: Vec<DynValue>) -> Result<[DynValue; N]> {
    values
        .try_into()
        .map_err(|values: Vec<_>| anyhow!("Expected {N} ONNX outputs, got {}", values.len()))
}

fn float<const N: usize>(shape: [usize; N], values: Vec<f32>) -> Result<DynValue> {
    Ok(Tensor::from_array((shape, values))?.into_dyn())
}

fn ints<const N: usize>(shape: [usize; N], values: Vec<i64>) -> Result<DynValue> {
    Ok(Tensor::from_array((shape, values))?.into_dyn())
}

fn language_vector(
    session: &Session,
    spec: &ModelSpec,
    language: Option<&str>,
) -> Result<Option<DynValue>> {
    let Some(input) = session
        .inputs()
        .iter()
        .find(|input| input.name() == "language_vector")
    else {
        return Ok(None);
    };
    let shape = input
        .dtype()
        .tensor_shape()
        .context("Invalid GigaAM language tensor")?;
    ensure!(
        shape.len() == 2
            && (1..=1024).contains(&shape[1])
            && shape[1] as usize > spec.languages.len(),
        "Invalid GigaAM language slot count"
    );
    let index = match language {
        None | Some("" | "auto") => 0,
        Some(code) => {
            spec.languages
                .iter()
                .position(|lang| lang == code)
                .with_context(|| format!("Unsupported GigaAM language {code}"))?
                + 1
        }
    };
    // The multilingual model reserves 32 slots for auto + 21 languages.
    let mut vector = vec![0.; shape[1] as usize];
    vector[index] = 1.;
    Ok(Some(float([1, vector.len()], vector)?))
}

fn append_tokens(spec: &ModelSpec, labels: &DynValue, ids: &mut Vec<usize>) -> Result<()> {
    let (shape, labels) = labels.try_extract_tensor::<i64>()?;
    let heads = spec.blank_ids.len();
    ensure!(
        shape.len() == 3 && shape[1] == heads as i64 && shape[2] == 1,
        "Unexpected RNN-T token dimensions"
    );
    for row in labels.chunks_exact(heads) {
        let token = row[spec.head_index];
        if token >= 0 {
            ensure!(
                token < spec.blank_ids[spec.head_index],
                "Invalid E2E token in GigaAM output"
            );
            ids.push(token as usize);
        }
    }
    Ok(())
}

enum Graphs {
    Batch { encoder: Session, advance: Session },
    Streaming(StreamGraphs),
}

pub(super) struct Zapformer {
    root: PathBuf,
    spec: ModelSpec,
    features: Features,
    tokenizer: SentencePieceProcessor,
    stream_spec: Option<StreamSpec>,
    graphs: Option<Graphs>,
}

impl Zapformer {
    pub(super) fn load(root: &Path, enable_streaming: bool) -> Result<Self> {
        let mut spec: ModelSpec =
            serde_json::from_slice(&fs::read(asset(root, "island-gigaam.json")?)?)?;
        ensure!(
            spec.version == 1 && matches!(spec.model.as_str(), "v4_rnnt" | "multilingual_v2_rnnt"),
            "Unsupported GigaAM package"
        );
        ensure!(
            spec.head_index < 2
                && (spec.stream_manifest.is_none()
                    || (spec.blank_ids.len() == 2 && (1..=4096).contains(&spec.pred_hidden))),
            "Invalid GigaAM head configuration"
        );
        ensure!(
            (2..=4096).contains(&spec.n_fft) && (1..=256).contains(&spec.n_mels),
            "Invalid GigaAM feature dimensions"
        );
        let features = Features::new(
            spec.hop_length,
            spec.n_mels,
            read_weights(root, &spec.window, spec.n_fft)?,
            read_weights(root, &spec.filters, spec.n_mels * (spec.n_fft / 2 + 1))?,
        )?;
        let tokenizer = SentencePieceProcessor::open(asset(root, &spec.tokenizer)?)?;
        if spec.stream_manifest.is_none() && spec.blank_ids.is_empty() {
            // Full-context advance embeds both blank IDs in its graph.
            spec.blank_ids = vec![0; 2];
            spec.blank_ids[spec.head_index] = tokenizer.model().vocab_size() as i64;
        }
        ensure!(
            spec.blank_ids.len() == 2
                && tokenizer.model().vocab_size() as i64 == spec.blank_ids[spec.head_index],
            "GigaAM tokenizer does not match its E2E head"
        );
        let stream_spec = spec
            .stream_manifest
            .as_ref()
            .filter(|_| enable_streaming)
            .map(|name| StreamSpec::load(root, name, spec.head_index))
            .transpose()?;
        asset(root, &spec.whole)?;
        asset(root, &spec.advance)?;
        let mut model = Self {
            root: root.into(),
            spec,
            features,
            tokenizer,
            stream_spec,
            graphs: None,
        };
        if model.streaming() {
            model.prepare_stream()?;
        } else {
            model.prepare_batch()?;
        }
        Ok(model)
    }

    pub(super) fn languages(&self) -> Vec<String> {
        self.spec.languages.clone()
    }
    pub(super) fn streaming(&self) -> bool {
        self.stream_spec.is_some()
    }

    fn prepare_batch(&mut self) -> Result<()> {
        if !matches!(self.graphs, Some(Graphs::Batch { .. })) {
            // Full-context and cached encoders have separate weight allocations.
            self.graphs = None;
            self.graphs = Some(Graphs::Batch {
                encoder: session(&self.root, &self.spec.whole)?,
                advance: session(&self.root, &self.spec.advance)?,
            });
        }
        Ok(())
    }

    pub(super) fn batch(&mut self, audio: &[f32], language: Option<&str>) -> Result<String> {
        self.prepare_batch()?;
        let Some(Graphs::Batch { encoder, advance }) = self.graphs.as_mut() else {
            unreachable!()
        };
        let mut frames = Vec::new();
        self.features.append(audio, &mut frames);
        let count = frames.len() / self.spec.n_mels;
        if count == 0 {
            return Ok(String::new());
        }
        let mel = float(
            [1, self.spec.n_mels, count],
            self.features.channels_first(&frames, count),
        )?;
        let length = ints([1], vec![count as i64])?;
        let mut inputs = vec![mel.into(), length.into()];
        if has_input(encoder, "context_frames") {
            inputs.push(ints([1], vec![-1])?.into());
        }
        if let Some(tag) = language_vector(encoder, &self.spec, language)? {
            inputs.push(tag.into());
        }
        let [lengths, projected] = outputs(run_graph(encoder, &inputs)?)?;
        let [tokens] = outputs(run_graph(advance, &[projected.into(), lengths.into()])?)?;
        let mut ids = Vec::new();
        append_tokens(&self.spec, &tokens, &mut ids)?;
        Ok(self.tokenizer.decode_ids(&ids)?)
    }

    fn prepare_stream(&mut self) -> Result<()> {
        if !matches!(self.graphs, Some(Graphs::Streaming(_))) {
            let Some(spec) = &self.stream_spec else {
                bail!("GigaAM package has no streaming graphs")
            };
            self.graphs = None;
            self.graphs = Some(Graphs::Streaming(StreamGraphs::load(&self.root, spec)?));
        }
        Ok(())
    }
}
