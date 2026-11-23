use serde::Deserialize;

/// CSS viewport coordinates, already including the element's CSS transform.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackdropRegion {
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
    /// Clockwise from top-left. Radii are in the same viewport coordinate space.
    pub radii: [f64; 4],
    pub opacity: f64,
    #[serde(default)]
    pub frost: Option<f64>,
    #[serde(default)]
    pub blur_radius: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackdropFrame {
    pub generation: u64,
    pub enabled: bool,
    pub viewport_width: f64,
    pub viewport_height: f64,
    pub scale: f64,
    pub frost: f64,
    pub regions: Vec<BackdropRegion>,
    #[serde(default)]
    pub lens: Option<DesktopLensSettings>,
    #[serde(default)]
    pub prewarm_lens: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLensSettings {
    pub region: usize,
    pub bend: f32,
    pub dispersion: f32,
    #[serde(default)]
    pub snapshot: bool,
    #[serde(default)]
    pub reduced_motion: bool,
}

impl BackdropFrame {
    pub(super) fn is_valid(&self) -> bool {
        self.scale.is_finite()
            && (0.5..=8.0).contains(&self.scale)
            && (0.0..=1.0).contains(&self.frost)
            && [self.viewport_width, self.viewport_height]
                .into_iter()
                .all(|value| value.is_finite() && value > 0.0 && value <= 32_768.0)
            && self.regions.len() <= 24
            && self.lens.is_none_or(|lens| {
                lens.region < self.regions.len()
                    && (0.0..=1.0).contains(&lens.bend)
                    && (0.0..=1.0).contains(&lens.dispersion)
            })
            && self.regions.iter().all(|region| region.is_valid(self))
    }

    pub(super) fn matches_pixels(&self, width: i32, height: i32) -> bool {
        (self.viewport_width * self.scale - f64::from(width)).abs() <= 2.0
            && (self.viewport_height * self.scale - f64::from(height)).abs() <= 2.0
    }

    pub(super) fn host_regions(&self, lens: Option<DesktopLensSettings>) -> Vec<BackdropRegion> {
        self.regions
            .iter()
            .enumerate()
            .map(|(index, region)| {
                let mut physical = region.physical(self.scale, self.frost);
                if lens.is_some_and(|settings| settings.region == index) {
                    // While the first captured frame is pending, use the same
                    // sigma and silhouette opacity as the GPU lens. At zero
                    // frost let the unfiltered desktop show through.
                    let sigma = region.lens_blur_sigma(self.scale, self.frost);
                    physical.blur_radius = (sigma > 0.0).then_some(f64::from(sigma));
                    physical.opacity = if sigma > 0.0 { region.opacity } else { 0.0 };
                }
                physical
            })
            .collect()
    }
}

impl BackdropRegion {
    pub(super) fn lens_blur_sigma(&self, scale: f64, global_frost: f64) -> f32 {
        // The slider spans 32 CSS pixels of visible blur, roughly 3 sigma.
        (self.frost.unwrap_or(global_frost) * (32.0 / 3.0) * scale).min(16.0) as f32
    }
    fn is_valid(&self, frame: &BackdropFrame) -> bool {
        [self.left, self.top, self.width, self.height, self.opacity]
            .into_iter()
            .all(f64::is_finite)
            && self.width > 0.0
            && self.height > 0.0
            && self.width <= frame.viewport_width * 2.0
            && self.height <= frame.viewport_height * 2.0
            && self.left >= -self.width
            && self.top >= -self.height
            && self.left < frame.viewport_width
            && self.top < frame.viewport_height
            && (0.0..=1.0).contains(&self.opacity)
            && self.frost.is_none_or(|frost| (0.0..=1.0).contains(&frost))
            && self
                .blur_radius
                .is_none_or(|radius| (0.0..=24.0).contains(&radius))
            && self
                .radii
                .into_iter()
                .all(|radius| radius.is_finite() && radius >= 0.0)
    }

    pub(super) fn physical(&self, scale: f64, frost: f64) -> Self {
        let limit = self.width.min(self.height) / 2.0;
        Self {
            left: self.left * scale,
            top: self.top * scale,
            width: self.width * scale,
            height: self.height * scale,
            radii: self.radii.map(|radius| radius.min(limit) * scale),
            opacity: self.opacity * self.frost.unwrap_or(frost),
            frost: None,
            blur_radius: self.blur_radius.map(|radius| (radius * scale).min(32.0)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame() -> BackdropFrame {
        BackdropFrame {
            generation: 1,
            enabled: true,
            viewport_width: 1280.0,
            viewport_height: 720.0,
            scale: 1.5,
            frost: 0.72,
            regions: vec![],
            lens: None,
            prewarm_lens: false,
        }
    }

    #[test]
    fn geometry_scales_each_corner_without_changing_the_css_input() {
        let region = BackdropRegion {
            left: 120.0,
            top: 0.0,
            width: 500.0,
            height: 200.0,
            radii: [0.0, 0.0, 36.0, 36.0],
            opacity: 0.6,
            frost: None,
            blur_radius: None,
        };
        let physical = region.physical(1.5, 0.5);
        assert_eq!(
            (physical.left, physical.width, physical.height),
            (180.0, 750.0, 300.0)
        );
        assert_eq!(physical.radii, [0.0, 0.0, 54.0, 54.0]);
        assert_eq!(region.width, 500.0);
        assert_eq!(physical.opacity, 0.3);
        assert_eq!(region.physical(1.0, 0.0).opacity, 0.0);
        assert_eq!(region.physical(1.0, 1.0).opacity, region.opacity);
        let individual = BackdropRegion {
            frost: Some(1.0),
            ..region
        };
        assert_eq!(individual.physical(1.0, 0.0).opacity, 0.6);
        assert!(!BackdropRegion {
            frost: Some(f64::NAN),
            ..individual
        }
        .is_valid(&frame()));
    }

    #[test]
    fn stale_dpi_viewport_and_unbounded_geometry_are_rejected() {
        let mut frame = frame();
        assert!(frame.is_valid() && frame.matches_pixels(1920, 1080));
        assert!(!frame.matches_pixels(1280, 720));
        frame.scale = f64::NAN;
        assert!(!frame.is_valid());
        frame = BackdropFrame {
            generation: 1,
            enabled: true,
            viewport_width: 1280.0,
            viewport_height: 720.0,
            scale: 1.5,
            frost: 0.72,
            regions: vec![],
            lens: None,
            prewarm_lens: false,
        };
        frame.regions = vec![
            BackdropRegion {
                left: 0.0,
                top: 0.0,
                width: 1.0,
                height: 1.0,
                radii: [0.0; 4],
                opacity: 1.0,
                frost: None,
                blur_radius: None,
            };
            25
        ];
        assert!(!frame.is_valid());
    }

    #[test]
    fn first_host_frame_matches_the_gpu_lens_without_restyling_satellites() {
        let mut frame = frame();
        let card = BackdropRegion {
            left: 120.0,
            top: -8.0,
            width: 500.0,
            height: 200.0,
            radii: [0.0, 0.0, 36.0, 36.0],
            opacity: 0.6,
            frost: None,
            blur_radius: None,
        };
        frame.regions = vec![card.clone(), card.clone()];
        let lens = DesktopLensSettings {
            region: 0,
            bend: 0.4,
            dispersion: 0.1,
            snapshot: false,
            reduced_motion: false,
        };
        let stock = frame.host_regions(None);
        assert_eq!(stock[0].blur_radius, None);
        for amount in [None, Some(0.35), Some(0.0)] {
            frame.regions[0].frost = amount;
            let prepared = frame.host_regions(Some(lens));
            let sigma = frame.regions[0].lens_blur_sigma(frame.scale, frame.frost);
            assert_eq!(prepared[0].blur_radius, (sigma > 0.0).then_some(f64::from(sigma)));
            assert_eq!(prepared[0].opacity, if sigma > 0.0 { card.opacity } else { 0.0 });
            assert_eq!(prepared[0].radii, stock[0].radii);
            assert_eq!(prepared[1], stock[1]);
        }
    }

    #[test]
    fn rejects_nonfinite_and_out_of_range_frost() {
        let mut frame = frame();
        for invalid in [-0.01, 1.01, f64::NAN, f64::INFINITY] {
            frame.frost = invalid;
            assert!(!frame.is_valid());
        }
    }
}
