pub(super) const SAMPLE_RATE: u32 = 48_000;
pub(super) const FRAME_BYTES: usize = 8;

struct Channel {
    low: f32,
    high: f32,
    band: f32,
    filtered: f32,
}

/// Measure positive changes in bass energy. Only a normalized attack envelope leaves the meter.
pub(super) struct BassMeter {
    channels: [Channel; 2],
    low_step: f32,
    high_step: f32,
    sum_squared: f32,
    full_squared: f32,
    samples: u32,
    previous_rms: f32,
    background: f32,
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
                    band: 0.0,
                    filtered: 0.0,
                },
                Channel {
                    low: 0.0,
                    high: 0.0,
                    band: 0.0,
                    filtered: 0.0,
                },
            ],
            low_step: step(35.0),
            high_step: step(155.0),
            sum_squared: 0.0,
            full_squared: 0.0,
            samples: 0,
            previous_rms: 0.0,
            background: 0.0,
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
                // Steepen the upper roll-off before estimating the low-frequency share of a mix.
                channel.band += (channel.high - channel.low - channel.band) * self.high_step;
                channel.filtered += (channel.band - channel.filtered) * self.high_step;
                self.sum_squared += channel.filtered * channel.filtered;
                self.full_squared += sample * sample;
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
            channel.band = 0.0;
            channel.filtered = 0.0;
        }
    }

    pub(super) fn level(&mut self) -> f32 {
        let rms = (self.sum_squared / self.samples.max(1) as f32).sqrt();
        // Two samples per stereo frame. The native reader polls at 50 ms even across gaps.
        let seconds = if self.samples == 0 {
            0.05
        } else {
            self.samples as f32 / (2 * SAMPLE_RATE) as f32
        };
        let bass_share = (self.sum_squared / self.full_squared.max(f32::EPSILON)).sqrt();
        self.full_squared = 0.0;
        self.sum_squared = 0.0;
        self.samples = 0;

        // A sustained note can exceed the slow background but is not a new attack.
        // Comparing with the previous window suppresses repeated triggers on a plateau.
        let rise = (rms - self.previous_rms.max(self.background)) / self.background.max(0.014);
        let audibility = ((rms - 0.0015) * 95.0).clamp(0.0, 1.0);
        // Filter leakage from a loud midrange onset can exceed the absolute noise floor.
        // A soft gate keeps low notes in a mix while rejecting midrange-only input.
        let bass_weight = ((bass_share - 0.060) / 0.075).clamp(0.0, 1.0);
        let attack = ((rise - 0.06) * 6.5).clamp(0.0, 1.0) * audibility * bass_weight;
        let background_seconds = if rms >= self.background { 0.36 } else { 0.18 };
        self.background += (rms - self.background) * (1.0 - (-seconds / background_seconds).exp());
        self.previous_rms = rms;
        self.envelope = attack.max(self.envelope * (-seconds / 0.085).exp());
        if self.envelope < 0.005 {
            self.envelope = 0.0;
        }
        self.envelope
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Synthesise stereo PCM just as the process loopback delivers it. Opposite phases
    // exercise channel-independent energy; the sequence keeps phase across packets.
    fn window(
        meter: &mut BassMeter,
        frame: &mut usize,
        frames: usize,
        hz: f64,
        amplitude: f32,
    ) -> f32 {
        mix_window(meter, frame, frames, &[(hz, amplitude)])
    }

    fn mix_window(
        meter: &mut BassMeter,
        frame: &mut usize,
        frames: usize,
        tones: &[(f64, f32)],
    ) -> f32 {
        let mut data = Vec::with_capacity(frames * FRAME_BYTES);
        for index in *frame..*frame + frames {
            let phase = std::f64::consts::TAU * index as f64 / SAMPLE_RATE as f64;
            let sample: f32 = tones
                .iter()
                .map(|(hz, amp)| (phase * hz).sin() as f32 * amp)
                .sum();
            data.extend(sample.to_le_bytes());
            data.extend((-sample).to_le_bytes());
        }
        *frame += frames;
        meter.add_packet(&data);
        meter.level()
    }

    #[test]
    fn bass_onset_is_stronger_than_treble_at_the_same_amplitude() {
        let bass = window(&mut BassMeter::new(), &mut 0, 2400, 80.0, 0.2);
        let treble = window(&mut BassMeter::new(), &mut 0, 2400, 1200.0, 0.2);
        assert!(bass > 0.85 && treble < 0.15, "bass={bass}, treble={treble}");
    }

    #[test]
    fn isolated_midrange_onsets_do_not_flash() {
        for hz in [400.0, 800.0, 1200.0] {
            for amplitude in [0.2, 0.64] {
                let mut meter = BassMeter::new();
                let mut frame = 0;
                let mut peak = 0.0_f32;
                for _ in 0..6 {
                    peak = peak.max(window(&mut meter, &mut frame, 2400, hz, amplitude));
                }
                println!("{hz} Hz at {amplitude} from silence: peak {peak:.3}");
                assert!(peak < 0.035, "{hz} Hz at {amplitude}: {peak}");
            }
        }
    }

    #[test]
    fn recognises_bass_attacks_under_louder_midrange() {
        let mut meter = BassMeter::new();
        let mut frame = 0;
        let mut lowest_peak = 1.0_f32;
        let mut highest_tail = 0.0_f32;
        for tick in 0..110 {
            let lead = if tick % 10 < 2 { 0.14 } else { 0.07 };
            let pulse = mix_window(
                &mut meter,
                &mut frame,
                2400,
                &[(83.0, lead), (400.0, 0.42), (1200.0, 0.18)],
            );
            if tick >= 20 && tick % 10 == 0 {
                lowest_peak = lowest_peak.min(pulse);
            }
            if tick >= 20 && tick % 10 == 9 {
                highest_tail = highest_tail.max(pulse);
            }
        }
        println!("83 Hz in 400/1200 Hz mix: minimum peak {lowest_peak:.3}, maximum tail {highest_tail:.3}");
        assert!(lowest_peak > 0.65);
        assert!(highest_tail < 0.02);
    }

    #[test]
    fn quiet_and_loud_sustained_notes_return_to_rest() {
        for hz in [39.0, 73.0, 119.0] {
            for amp in [0.025, 0.64] {
                let mut meter = BassMeter::new();
                let mut frame = 0;
                for tick in 0..60 {
                    let frames = [2160, 2640, 2400][tick % 3];
                    let pulse = window(&mut meter, &mut frame, frames, hz, amp);
                    if tick >= 20 {
                        assert!(pulse < 0.02, "{hz} Hz at {amp}, tick={tick}: {pulse}");
                    }
                }
            }
        }
    }

    #[test]
    fn attacks_remain_separate_on_quiet_and_compressed_bass_tracks() {
        for (bed, accent, min_peak) in [(0.035, 0.1, 0.85), (0.64, 0.8, 0.85), (0.64, 0.72, 0.18)] {
            let mut meter = BassMeter::new();
            let mut frame = 0;
            let (mut lowest_peak, mut highest_peak, mut level_at_250ms, mut before_next) =
                (1.0_f32, 0.0_f32, 0.0_f32, 0.0_f32);
            for tick in 0..120 {
                // 120 BPM, 100 ms accents. The last example has only ~1 dB of headroom.
                let amplitude = if tick >= 20 && tick % 10 < 2 {
                    accent
                } else {
                    bed
                };
                let pulse = window(&mut meter, &mut frame, 2400, 83.0, amplitude);
                if tick >= 30 {
                    match tick % 10 {
                        0 => {
                            lowest_peak = lowest_peak.min(pulse);
                            highest_peak = highest_peak.max(pulse);
                        }
                        5 => level_at_250ms = level_at_250ms.max(pulse),
                        9 => before_next = before_next.max(pulse),
                        _ => {}
                    }
                }
            }
            println!("{bed} → {accent}: peaks {lowest_peak:.3}–{highest_peak:.3}, after 250 ms {level_at_250ms:.3}, before next beat {before_next:.3}");
            assert!(lowest_peak >= min_peak);
            assert!(level_at_250ms < 0.07);
            assert!(before_next < 0.012);
        }
    }

    #[test]
    fn recovers_after_silence_and_handles_empty_capture_buffers() {
        let mut meter = BassMeter::new();
        let mut frame = 0;
        for _ in 0..24 {
            window(&mut meter, &mut frame, 2400, 80.0, 0.64);
        }
        window(&mut meter, &mut frame, 2400, 80.0, 0.8);
        meter.add_silence(2400);
        let mut previous = meter.level();
        for _ in 0..24 {
            let pulse = meter.level();
            assert!(pulse <= previous);
            previous = pulse;
        }
        assert_eq!(previous, 0.0);
        assert!(window(&mut meter, &mut frame, 2400, 80.0, 0.08) > 0.85);
    }
}
