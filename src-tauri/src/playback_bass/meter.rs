pub(super) const SAMPLE_RATE: u32 = 48_000;
pub(super) const FRAME_BYTES: usize = 8;

struct Channel {
    low: f32,
    high: f32,
}

/// Two one-pole filters isolate the bass band. Only a scalar leaves this module.
pub(super) struct BassMeter {
    channels: [Channel; 2],
    low_step: f32,
    high_step: f32,
    sum_squared: f32,
    samples: u32,
    envelope: f32,
}

impl BassMeter {
    pub(super) fn new() -> Self {
        let step =
            |frequency: f32| 1.0 - (-std::f32::consts::TAU * frequency / SAMPLE_RATE as f32).exp();
        Self {
            channels: [
                Channel {
                    low: 0.0,
                    high: 0.0,
                },
                Channel {
                    low: 0.0,
                    high: 0.0,
                },
            ],
            low_step: step(35.0),
            high_step: step(155.0),
            sum_squared: 0.0,
            samples: 0,
            envelope: 0.0,
        }
    }

    pub(super) fn add_packet(&mut self, bytes: &[u8]) {
        for frame in bytes.chunks_exact(FRAME_BYTES) {
            for (channel, sample) in self.channels.iter_mut().zip(frame.chunks_exact(4)) {
                let value = f32::from_le_bytes(sample.try_into().expect("four PCM bytes"));
                let sample = if value.is_finite() {
                    value.clamp(-1.0, 1.0)
                } else {
                    0.0
                };
                channel.low += (sample - channel.low) * self.low_step;
                channel.high += (sample - channel.high) * self.high_step;
                self.sum_squared += (channel.high - channel.low).powi(2);
                self.samples += 1;
            }
        }
    }

    pub(super) fn add_silence(&mut self, frames: u32) {
        self.reset_filters();
        self.samples += frames * 2;
    }

    pub(super) fn reset_filters(&mut self) {
        for channel in &mut self.channels {
            channel.low = 0.0;
            channel.high = 0.0;
        }
    }

    pub(super) fn level(&mut self) -> f32 {
        let rms = (self.sum_squared / self.samples.max(1) as f32).sqrt();
        self.sum_squared = 0.0;
        self.samples = 0;
        let target = (rms * 5.0).clamp(0.0, 1.0);
        let step = if target > self.envelope { 0.75 } else { 0.34 };
        self.envelope += (target - self.envelope) * step;
        if self.envelope < 0.005 {
            self.envelope = 0.0;
        }
        self.envelope
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(frequency: f32) -> BassMeter {
        let mut meter = BassMeter::new();
        let mut data = Vec::with_capacity(4_800 * FRAME_BYTES);
        for frame in 0..4_800 {
            let value =
                (std::f32::consts::TAU * frequency * frame as f32 / SAMPLE_RATE as f32).sin() * 0.2;
            // Opposite phase still produces bass in each rendered channel.
            data.extend(value.to_le_bytes());
            data.extend((-value).to_le_bytes());
        }
        meter.add_packet(&data);
        meter
    }

    #[test]
    fn bass_produces_a_stronger_signal_than_equal_treble() {
        let bass = tone(80.0).level();
        let treble = tone(1_200.0).level();
        assert!(bass > 0.2 && bass <= 1.0);
        assert!(bass > treble * 3.0);
    }

    #[test]
    fn missing_samples_decay_to_silence() {
        let mut meter = tone(80.0);
        assert!(meter.level() > 0.0);
        meter.add_silence(2_400);
        for _ in 0..16 {
            meter.level();
        }
        assert_eq!(meter.level(), 0.0);
    }
}
