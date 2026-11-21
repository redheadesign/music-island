use serde::Deserialize;

/// CSS viewport coordinates, already including the element's CSS transform.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct BackdropRegion {
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
    /// Clockwise from top-left. Radii are in the same viewport coordinate space.
    pub radii: [f64; 4],
    pub opacity: f64,
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
            && self.regions.iter().all(|region| region.is_valid(self))
    }

    pub(super) fn matches_pixels(&self, width: i32, height: i32) -> bool {
        (self.viewport_width * self.scale - f64::from(width)).abs() <= 2.0
            && (self.viewport_height * self.scale - f64::from(height)).abs() <= 2.0
    }
}

impl BackdropRegion {
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
            opacity: self.opacity * frost,
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
        };
        frame.regions = vec![
            BackdropRegion {
                left: 0.0,
                top: 0.0,
                width: 1.0,
                height: 1.0,
                radii: [0.0; 4],
                opacity: 1.0
            };
            25
        ];
        assert!(!frame.is_valid());
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
