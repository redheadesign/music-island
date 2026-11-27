use anyhow::{ensure, Result};
use rustfft::{num_complex::Complex, Fft, FftPlanner};
use std::sync::Arc;

/// Same uncentred, power-2 log-mel transform as GigaAM's FeatureExtractor.
/// The package contains the actual Torchaudio window and mel weights.
pub(super) struct Features {
    pub(super) hop: usize,
    pub(super) bands: usize,
    window: Vec<f32>,
    filters: Vec<Vec<(usize, f32)>>,
    fft: Arc<dyn Fft<f32>>,
    work: Vec<Complex<f32>>,
    scratch: Vec<Complex<f32>>,
    power: Vec<f32>,
}

impl Features {
    pub(super) fn new(
        hop: usize,
        bands: usize,
        window: Vec<f32>,
        weights: Vec<f32>,
    ) -> Result<Self> {
        let n = window.len();
        let bins = n / 2 + 1;
        ensure!(
            (1..=n).contains(&hop) && (2..=4096).contains(&n) && (1..=256).contains(&bands),
            "Invalid GigaAM spectrogram dimensions"
        );
        ensure!(
            weights.len() == bands * bins && weights.iter().chain(&window).all(|v| v.is_finite()),
            "Invalid GigaAM spectrogram weights"
        );
        let filters = weights
            .chunks_exact(bins)
            .map(|row| {
                row.iter()
                    .copied()
                    .enumerate()
                    .filter(|(_, weight)| *weight != 0.0)
                    .collect()
            })
            .collect();
        let fft = FftPlanner::new().plan_fft_forward(n);
        Ok(Self {
            hop,
            bands,
            window,
            filters,
            work: vec![Complex::default(); n],
            scratch: vec![Complex::default(); fft.get_inplace_scratch_len()],
            power: vec![0.0; bins],
            fft,
        })
    }

    /// Append time-major frames and return the number of samples consumed.
    /// The caller retains the overlap for the next arbitrary PCM packet.
    pub(super) fn append(&mut self, pcm: &[f32], frames: &mut Vec<f32>) -> usize {
        let mut consumed = 0;
        for frame in pcm.windows(self.window.len()).step_by(self.hop) {
            for ((sample, &wave), &window) in self.work.iter_mut().zip(frame).zip(&self.window) {
                *sample = Complex::new(wave * window, 0.0);
            }
            self.fft
                .process_with_scratch(&mut self.work, &mut self.scratch);
            for (power, bin) in self.power.iter_mut().zip(&self.work) {
                *power = bin.norm_sqr();
            }
            for filter in &self.filters {
                let value = filter
                    .iter()
                    .map(|&(bin, weight)| self.power[bin] * weight)
                    .sum::<f32>();
                frames.push(value.clamp(1e-9, 1e9).ln());
            }
            consumed += self.hop;
        }
        consumed
    }

    pub(super) fn channels_first(&self, frames: &[f32], padded: usize) -> Vec<f32> {
        let mut values = vec![0.; padded * self.bands];
        for (time, frame) in frames.chunks_exact(self.bands).enumerate() {
            for (band, &feature) in frame.iter().enumerate() {
                values[band * padded + time] = feature;
            }
        }
        values
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packets_preserve_window_overlap_and_flush_only_real_frames() {
        let mut f = Features::new(2, 2, vec![1.; 4], vec![1., 0., 0., 0., 1., 0.]).unwrap();
        let pcm = [1., 2., 3., 4., 5., 6., 7.];
        let mut whole = Vec::new();
        assert_eq!(f.append(&pcm, &mut whole), 4);
        assert!((whole[0] - 100f32.ln()).abs() < 1e-5);
        let mut packets = Vec::new();
        let mut pending = Vec::new();
        for packet in pcm.chunks(3) {
            pending.extend_from_slice(packet);
            let used = f.append(&pending, &mut packets);
            pending.drain(..used);
        }
        assert_eq!(packets, whole);
        assert_eq!(pending.len(), 3);
        assert_eq!(
            f.channels_first(&packets, 3),
            vec![whole[0], whole[2], 0., whole[1], whole[3], 0.]
        );
    }
}
