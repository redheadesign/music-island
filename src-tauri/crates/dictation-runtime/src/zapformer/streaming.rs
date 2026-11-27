use super::*;
use music_island_dictation_protocol::Text;

#[derive(Deserialize)]
struct StateSpec {
    shape: Vec<usize>,
    dtype: String,
}

impl StateSpec {
    fn zeros(&self) -> Result<DynValue> {
        let len = self
            .shape
            .iter()
            .try_fold(1usize, |size, &dim| size.checked_mul(dim))
            .context("Overflow in GigaAM cache shape")?;
        ensure!(len <= 32 * 1024 * 1024, "Invalid GigaAM cache size");
        let shape = self.shape.clone();
        Ok(match self.dtype.as_str() {
            "float32" => Tensor::from_array((shape, vec![0f32; len]))?.into_dyn(),
            "int64" => Tensor::from_array((shape, vec![0i64; len]))?.into_dyn(),
            "int32" => Tensor::from_array((shape, vec![0i32; len]))?.into_dyn(),
            other => bail!("Unsupported GigaAM cache dtype {other}"),
        })
    }
}

#[derive(Deserialize)]
struct GraphSpec {
    file: String,
    #[serde(default)]
    states: Vec<StateSpec>,
}

#[derive(Deserialize)]
pub(super) struct StreamSpec {
    future_context_ms: usize,
    frame_shift_ms: f64,
    subsampling_factor: usize,
    frontend: GraphSpec,
    step: GraphSpec,
    states: Vec<StateSpec>,
    packet_decode: String,
    packet_heads: Vec<String>,
}

impl StreamSpec {
    pub(super) fn load(root: &Path, name: &str, e2e_index: usize) -> Result<Self> {
        let spec: Self = serde_json::from_slice(&fs::read(asset(root, name)?)?)?;
        ensure!(
            spec.future_context_ms == 320
                && spec.frame_shift_ms.is_finite()
                && (1.0..=320.0).contains(&spec.frame_shift_ms)
                && (1..=32).contains(&spec.subsampling_factor),
            "Unsupported GigaAM streaming context"
        );
        ensure!(
            spec.packet_heads.len() == 2 && spec.packet_heads[e2e_index] == "e2e",
            "Incorrect GigaAM E2E head selection"
        );
        ensure!(
            spec.frontend.states.len() <= 128 && spec.states.len() <= 2048,
            "Invalid GigaAM cache count"
        );
        Ok(spec)
    }

    fn context(&self) -> usize {
        (self.future_context_ms as f64 / self.frame_shift_ms) as usize
    }
    fn block(&self) -> usize {
        self.context() * self.subsampling_factor
    }
}

pub(super) struct StreamGraphs {
    frontend: Session,
    step: Session,
    packet: Session,
}

impl StreamGraphs {
    pub(super) fn load(root: &Path, spec: &StreamSpec) -> Result<Self> {
        Ok(Self {
            frontend: session(root, &spec.frontend.file)?,
            step: session(root, &spec.step.file)?,
            packet: session(root, &spec.packet_decode)?,
        })
    }
}

/// State belongs to exactly one Begin/Finalize (or Begin/Cancel) operation.
struct StreamState {
    pcm: Vec<f32>,
    frames: Vec<f32>,
    frontend: Vec<DynValue>,
    encoder: Vec<DynValue>,
    position: DynValue,
    cache_valid: DynValue,
    language: Option<DynValue>,
    previous: DynValue,
    hidden: DynValue,
    cell: DynValue,
    ids: Vec<usize>,
    published: String,
    revision: u64,
    received: usize,
    processed: usize,
}

impl StreamState {
    fn new(spec: &ModelSpec, stream: &StreamSpec, language: Option<DynValue>) -> Result<Self> {
        let heads = spec.blank_ids.len();
        let hidden = || {
            float(
                [heads, 1, spec.pred_hidden],
                vec![0.; heads * spec.pred_hidden],
            )
        };
        Ok(Self {
            pcm: Vec::new(),
            frames: Vec::new(),
            frontend: stream
                .frontend
                .states
                .iter()
                .map(StateSpec::zeros)
                .collect::<Result<_>>()?,
            encoder: stream
                .states
                .iter()
                .map(StateSpec::zeros)
                .collect::<Result<_>>()?,
            position: ints([1], vec![0])?,
            cache_valid: ints([1], vec![0])?,
            language,
            previous: ints([heads, 1], spec.blank_ids.clone())?,
            hidden: hidden()?,
            cell: hidden()?,
            ids: Vec::new(),
            published: String::new(),
            revision: 0,
            received: 0,
            processed: 0,
        })
    }

    fn packet(
        &mut self,
        graphs: &mut StreamGraphs,
        stream: &StreamSpec,
        spec: &ModelSpec,
        mel: DynValue,
        count: usize,
    ) -> Result<()> {
        let mut input = vec![mel.into(), ints([1], vec![count as i64])?.into()];
        input.extend(self.frontend.iter().map(SessionInputValue::from));
        let mut result = run_graph(&mut graphs.frontend, &input)?;
        drop(input);
        ensure!(
            result.len() == 2 + self.frontend.len(),
            "GigaAM frontend returned an invalid cache"
        );
        self.frontend = result.split_off(2);
        let [features, lengths] = outputs(result)?;
        let mut input = vec![features.into(), lengths.into()];
        if has_input(&graphs.step, "context_frames") {
            input.push(ints([1], vec![stream.context() as i64])?.into());
        }
        input.extend([(&self.position).into(), (&self.cache_valid).into()]);
        if let Some(language) = &self.language {
            input.push(language.into());
        }
        input.extend(self.encoder.iter().map(SessionInputValue::from));
        let mut result = run_graph(&mut graphs.step, &input)?;
        drop(input);
        ensure!(
            result.len() == 4 + self.encoder.len(),
            "GigaAM encoder returned an invalid cache"
        );
        self.encoder = result.split_off(4);
        let [encoded, lengths, position, valid] = outputs(result)?;
        self.position = position;
        self.cache_valid = valid;
        if lengths.try_extract_tensor::<i64>()?.1 == [0] {
            return Ok(());
        }
        let [tokens, previous, hidden, cell] = outputs(run_graph(
            &mut graphs.packet,
            &[
                encoded.into(),
                lengths.into(),
                (&self.previous).into(),
                (&self.hidden).into(),
                (&self.cell).into(),
            ],
        )?)?;
        self.previous = previous;
        self.hidden = hidden;
        self.cell = cell;
        append_tokens(spec, &tokens, &mut self.ids)
    }
}

pub(crate) struct Stream<'a> {
    spec: &'a ModelSpec,
    stream: &'a StreamSpec,
    features: &'a mut Features,
    tokenizer: &'a SentencePieceProcessor,
    graphs: &'a mut StreamGraphs,
    state: StreamState,
}

impl Zapformer {
    pub(crate) fn begin(&mut self, language: Option<&str>) -> Result<Stream<'_>> {
        self.prepare_stream()?;
        let Some(Graphs::Streaming(graphs)) = &mut self.graphs else {
            unreachable!()
        };
        let stream = self
            .stream_spec
            .as_ref()
            .context("Missing GigaAM stream manifest")?;
        let state = StreamState::new(
            &self.spec,
            stream,
            language_vector(&graphs.step, &self.spec, language)?,
        )?;
        Ok(Stream {
            spec: &self.spec,
            stream,
            features: &mut self.features,
            tokenizer: &self.tokenizer,
            graphs,
            state,
        })
    }
}

impl Stream<'_> {
    pub(crate) fn feed(&mut self, audio: &[f32], finish: bool) -> Result<Text> {
        let state = &mut self.state;
        state.received += audio.len();
        state.pcm.extend_from_slice(audio);
        let used = self.features.append(&state.pcm, &mut state.frames);
        state.pcm.drain(..used);
        let block = self.stream.block();
        let bands = self.features.bands;
        let frames = state.frames.len() / bands;
        let ready = if finish {
            frames
        } else {
            frames / block * block
        };
        let start_tokens = state.ids.len();
        for offset in (0..ready).step_by(block) {
            let count = (ready - offset).min(block);
            let values = self.features.channels_first(
                &state.frames[offset * bands..(offset + count) * bands],
                block,
            );
            state.packet(
                self.graphs,
                self.stream,
                self.spec,
                float([1, bands, block], values)?,
                count,
            )?;
        }
        state.frames.drain(..ready * bands);
        state.processed += ready * self.features.hop;
        if finish {
            state.processed = state.received;
        }
        let mut changed = false;
        if finish || start_tokens != state.ids.len() {
            let text = self.tokenizer.decode_ids(&state.ids)?;
            let text = if finish {
                &text
            } else {
                text.trim_end_matches('\u{fffd}')
            };
            if text != state.published {
                state.published = text.to_owned();
                state.revision += 1;
                changed = true;
            }
        }
        Ok(Text {
            full: state.published.clone(),
            committed: state.published.clone(),
            input_received_ms: state.received as f64 / 16.0,
            audio_committed_ms: state.processed as f64 / 16.0,
            buffered_ms: state.received.saturating_sub(state.processed) as f64 / 16.0,
            revision: state.revision,
            committed_changed: changed,
            ..Default::default()
        })
    }
}
