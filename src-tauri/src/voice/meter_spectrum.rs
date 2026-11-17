use rustfft::{num_complex::Complex, FftPlanner};

/// The settings meters reuse one FFT plan, frequency scale and scratch between both channels.
pub struct MeterSpectrum {
    fft: std::sync::Arc<dyn rustfft::Fft<f32>>,
    window: Vec<f32>,
    edges: Vec<usize>,
    buffer: Vec<Complex<f32>>,
    scratch: Vec<Complex<f32>>,
}

impl MeterSpectrum {
    pub fn new(sample_rate: u32, samples: usize, bands: usize) -> Self {
        let fft = FftPlanner::<f32>::new().plan_fft_forward(samples);
        let window = (0..samples)
            .map(|i| 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / samples as f32).cos()))
            .collect();
        let bin_width = sample_rate as f32 / samples as f32;
        let nyquist = sample_rate as f32 / 2.0;
        let edges = (0..=bands)
            .map(|i| {
                let hz = 20.0 * (nyquist / 20.0).powf(i as f32 / bands as f32);
                ((hz / bin_width) as usize).min(samples / 2)
            })
            .collect();
        let scratch = vec![Complex::default(); fft.get_inplace_scratch_len()];
        Self {
            fft,
            window,
            edges,
            buffer: vec![Complex::default(); samples],
            scratch,
        }
    }

    pub fn measure(&mut self, samples: &[f32], output: &mut [f32]) {
        debug_assert_eq!(self.buffer.len(), samples.len());
        debug_assert_eq!(self.edges.len(), output.len() + 1);
        for ((bin, &sample), &weight) in self.buffer.iter_mut().zip(samples).zip(&self.window) {
            *bin = Complex::new(sample * weight, 0.0);
        }
        self.fft
            .process_with_scratch(&mut self.buffer, &mut self.scratch);
        for (level, edge) in output.iter_mut().zip(self.edges.windows(2)) {
            let end = edge[1].max(edge[0] + 1).min(samples.len() / 2);
            let peak = self.buffer[edge[0]..end]
                .iter()
                .map(|bin| (bin.re * bin.re + bin.im * bin.im).sqrt() / samples.len() as f32)
                .fold(0.0f32, f32::max);
            let db = if peak > 1e-10 {
                20.0 * peak.log10()
            } else {
                -80.0
            };
            *level = ((db + 80.0) / 70.0).clamp(0.0, 1.0);
        }
    }
}

#[cfg(test)]
mod meter_tests {
    use super::MeterSpectrum;

    #[test]
    fn reused_fft_separates_channels_and_clears_previous_bins() {
        const SIZE: usize = 1920;
        let mut meter = MeterSpectrum::new(48_000, SIZE, 64);
        let tone = |hz: f32| -> Vec<f32> {
            (0..SIZE)
                .map(|i| (std::f32::consts::TAU * hz * i as f32 / 48_000.0).sin())
                .collect()
        };
        let mut low = [0.0f32; 64];
        let mut high = [0.0f32; 64];
        meter.measure(&tone(100.0), &mut low);
        meter.measure(&tone(4000.0), &mut high);
        // The former implementation's 20 Hz..24 kHz logarithmic bands.
        assert!(low[14] > 0.8 && high[14] < 0.01);
        assert!(high[47] > 0.8 && low[47] < 0.01);
        meter.measure(&[0.0; SIZE], &mut high);
        assert!(high.iter().all(|value| *value == 0.0));
    }
}
