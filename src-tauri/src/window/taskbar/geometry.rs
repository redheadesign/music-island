//! Physical-pixel placement only; no shell or window side effects.

/// Baseline native-player width at 100% scale without the optional Like control.
pub(super) const PLAYER_WIDTH: f64 = 144.0;

pub(super) fn is_app_host(class: &str) -> bool {
    matches!(
        class,
        "ReBarWindow32" | "MSTaskSwWClass" | "MSTaskListWClass"
    )
}

pub(super) fn is_render_host(class: &str) -> bool {
    matches!(
        class,
        "Windows.UI.Composition.DesktopWindowContentBridge"
            | "Windows.UI.Core.CoreWindow"
            | "Windows.UI.Input.InputSite.WindowClass"
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct Rect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl Rect {
    pub fn width(self) -> i32 {
        self.right.saturating_sub(self.left)
    }
    pub fn height(self) -> i32 {
        self.bottom.saturating_sub(self.top)
    }
    pub fn valid(self) -> bool {
        self.width() > 0 && self.height() > 0
    }
    pub fn contains(self, other: Self) -> bool {
        other.valid()
            && other.left >= self.left
            && other.right <= self.right
            && other.top >= self.top
            && other.bottom <= self.bottom
    }
    pub fn relative_to(self, origin: Self) -> Self {
        Self {
            left: self.left.saturating_sub(origin.left),
            top: self.top.saturating_sub(origin.top),
            right: self.right.saturating_sub(origin.left),
            bottom: self.bottom.saturating_sub(origin.top),
        }
    }
}

/// A stretched host is usable only after its actual app-button descendants were
/// enumerated. Without those descendants, keep reserving its complete bounds.
pub(super) fn app_guard(bar: Rect, host: Rect, buttons: &[Rect]) -> Rect {
    let right = buttons
        .iter()
        .filter(|button| host.contains(**button))
        .map(|button| button.right)
        .max()
        .unwrap_or(host.right);
    Rect { right, ..bar }
}

/// Convert bounds read between two parent observations. An autohide slide changes
/// only Y; reserve the whole vertical strip in that case rather than using a
/// mixed-time Y coordinate. Other geometry changes require a fresh snapshot.
pub(super) fn local_occupied(
    bounds: Rect,
    before: Rect,
    after: Rect,
    client: Rect,
) -> Option<Rect> {
    if before.left != after.left
        || before.width() != after.width()
        || before.height() != after.height()
    {
        return None;
    }
    let mut local = bounds.relative_to(after);
    if before.top != after.top {
        local.top = client.top;
        local.bottom = client.bottom;
    }
    Some(local)
}

#[cfg(test)]
pub(super) fn place(bar: Rect, occupied: &[Rect], dpi: u32) -> Option<Rect> {
    place_sized(bar, occupied, dpi, PLAYER_WIDTH.round() as i32)
}

pub(super) fn place_sized(
    bar: Rect,
    occupied: &[Rect],
    dpi: u32,
    logical_width: i32,
) -> Option<Rect> {
    if !bar.valid() || bar.height() >= bar.width() || !(72..=768).contains(&dpi) {
        return None;
    }
    let px = |logical: f64| (logical * f64::from(dpi) / 96.0).round() as i32;
    let margin = px(8.0);
    // Small taskbars have no room for an outer vertical inset. Preserve the
    // 32 logical-pixel control height before adding any decorative breathing room.
    let height = px(40.0).min((bar.height() - px(8.0)).max(px(32.0)).min(bar.height()));
    if height < px(32.0) {
        return None;
    }
    let left = bar.left.saturating_add(margin);
    let right = bar.right.saturating_sub(margin);
    let top = bar.top + (bar.height() - height) / 2;
    let bottom = top + height;
    let minimum = px(f64::from(logical_width.max(1)));
    let mut ranges: Vec<(i32, i32)> = occupied
        .iter()
        .filter(|r| r.valid() && r.top < bottom && r.bottom > top)
        .map(|r| {
            (
                r.left.saturating_sub(margin).max(left),
                r.right.saturating_add(margin).min(right),
            )
        })
        .filter(|(a, b)| a < b)
        .collect();
    ranges.sort_unstable();
    ranges.push((right, right));
    let mut cursor = left;
    let mut best: Option<Rect> = None;
    for (start, end) in ranges {
        let gap = start.saturating_sub(cursor);
        if gap >= minimum {
            // Keep a compact 16px total separation from the notification area.
            // Prefer the rightmost safe gap so the player follows the tray edge
            // in both directions instead of staying at an obsolete coordinate.
            let reserve = px(8.0).min((gap - minimum) / 2);
            let inset = gap - minimum - reserve;
            best = Some(Rect {
                left: cursor + inset,
                top,
                right: cursor + inset + minimum,
                bottom,
            });
        }
        cursor = cursor.max(end);
    }
    best
}

/// Revalidate a previously selected rectangle after Explorer lays out new buttons.
#[cfg(test)]
pub(super) fn still_clear(bar: Rect, occupied: &[Rect], dpi: u32, candidate: Rect) -> bool {
    still_clear_sized(bar, occupied, dpi, candidate, PLAYER_WIDTH.round() as i32)
}

pub(super) fn still_clear_sized(
    bar: Rect,
    occupied: &[Rect],
    dpi: u32,
    candidate: Rect,
    logical_width: i32,
) -> bool {
    if !bar.valid() || !candidate.valid() || !(72..=768).contains(&dpi) {
        return false;
    }
    let margin = (8.0 * f64::from(dpi) / 96.0).round() as i32;
    let expected_width = (f64::from(logical_width.max(1)) * f64::from(dpi) / 96.0).round() as i32;
    candidate.width() == expected_width
        && candidate.left >= bar.left.saturating_add(margin)
        && candidate.right <= bar.right.saturating_sub(margin)
        && candidate.top >= bar.top
        && candidate.bottom <= bar.bottom
        && !occupied.iter().any(|r| {
            r.valid()
                && r.top < candidate.bottom
                && r.bottom > candidate.top
                && r.left.saturating_sub(margin) < candidate.right
                && r.right.saturating_add(margin) > candidate.left
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(left: i32, right: i32) -> Rect {
        Rect {
            left,
            top: 1032,
            right,
            bottom: 1080,
        }
    }

    #[test]
    fn characterizes_full_width_render_host_masking_a_real_gap() {
        // HWND probe: Explorer exposes a full-width composition surface in
        // addition to compact ReBar/MSTaskSw and notification-area rectangles.
        // A render surface is not a row of buttons, but treating it as occupied
        // makes the otherwise usable gap disappear at any player width.
        let bar = rect(0, 2560);
        let controls = [rect(0, 1412), rect(2251, 2560)];
        assert!(place(bar, &controls, 96).is_some());
        assert!(place(bar, &[controls[0], controls[1], bar], 96).is_none());
    }

    #[test]
    fn characterizes_stretched_classic_host_and_actual_button_bounds() {
        // On a classic taskbar ReBar can stretch all the way to the tray.
        // It is safe to use its empty tail only when child button bounds exist.
        let bar = rect(0, 1804);
        assert!(place(bar, &[rect(0, 1510), rect(1510, 1804)], 96).is_none());
        assert!(place(bar, &[rect(0, 990), rect(1510, 1804)], 96).is_some());
    }

    #[test]
    fn characterizes_tray_expansion_colliding_with_a_right_edge_anchor() {
        // Real trace: notification icons expanded 2251 -> 2219 -> 2251.
        // The old right-edge placement immediately overlapped the new tray.
        let bar = rect(0, 2560);
        let anchored = Rect {
            left: 2099,
            right: 2243,
            top: 1036,
            bottom: 1076,
        };
        assert!(still_clear(
            bar,
            &[rect(0, 1721), rect(2251, 2560)],
            96,
            anchored
        ));
        assert!(!still_clear(
            bar,
            &[rect(0, 1721), rect(2219, 2560)],
            96,
            anchored
        ));
    }

    #[test]
    fn anchors_with_compact_clearance_and_can_reposition_for_tray_expansion() {
        let bar = rect(0, 2560);
        let candidate = place(bar, &[rect(0, 1721), rect(2251, 2560)], 96).unwrap();
        assert_eq!(candidate.left, 2091);
        assert_eq!(candidate.right, 2235);
        for tray_left in [2251, 2219, 2187, 2251] {
            let moved = place(bar, &[rect(0, 1721), rect(tray_left, 2560)], 96).unwrap();
            assert_eq!(tray_left - moved.right, 16);
            assert!(still_clear(
                bar,
                &[rect(0, 1721), rect(tray_left, 2560)],
                96,
                moved
            ));
        }
    }

    #[test]
    fn characterizes_taskbar_slide_without_changing_local_placement() {
        let bar = rect(0, 2560);
        let controls = [rect(0, 1412), rect(2251, 2560)];
        let shown = place(bar, &controls, 96).unwrap();
        let slide = |r: Rect| Rect {
            top: r.top + 46,
            bottom: r.bottom + 46,
            ..r
        };
        let hidden = place(slide(bar), &controls.map(slide), 96).unwrap();
        assert_eq!(hidden.left, shown.left);
        assert_eq!(hidden.top - slide(bar).top, shown.top - bar.top);
        assert_eq!(hidden.height(), shown.height());
    }

    #[test]
    fn mixed_time_bounds_during_autohide_preserve_horizontal_collision_guards() {
        let shown = rect(0, 2560);
        let hidden = Rect {
            top: shown.top + 46,
            bottom: shown.bottom + 46,
            ..shown
        };
        let local = Rect {
            left: 0,
            top: 0,
            right: 2560,
            bottom: 48,
        };
        let result = local_occupied(rect(1412, 1460), shown, hidden, local).unwrap();
        assert_eq!(
            result,
            Rect {
                left: 1412,
                top: 0,
                right: 1460,
                bottom: 48
            }
        );
        assert!(local_occupied(
            rect(1412, 1460),
            shown,
            Rect {
                right: 1920,
                ..hidden
            },
            local
        )
        .is_none());
    }

    #[test]
    fn chooses_gap_before_tray_and_never_covers_centered_apps() {
        let occupied = [rect(0, 180), rect(720, 1120), rect(1700, 1920)];
        let result = place(rect(0, 1920), &occupied, 96).unwrap();
        assert_eq!(result.width(), 144);
        assert_eq!(result.height(), 40);
        assert!(result.left >= 1128 && result.right <= 1692);
    }

    #[test]
    fn prefers_the_rightmost_safe_gap_even_when_an_earlier_gap_is_wider() {
        let bar = rect(0, 1920);
        let occupied = [rect(0, 200), rect(1000, 1200), rect(1600, 1920)];
        let result = place(bar, &occupied, 96).unwrap();
        assert!(result.left >= 1208);
        assert_eq!(1600 - result.right, 16);
        assert!(still_clear(bar, &occupied, 96, result));
    }

    #[test]
    fn keeps_fixed_width_and_hides_below_minimum() {
        let result = place(rect(0, 1000), &[rect(0, 500), rect(790, 1000)], 96).unwrap();
        assert_eq!(result.width(), 144);
        assert!(place(rect(0, 1000), &[rect(0, 631), rect(790, 1000)], 96).is_none());
        assert_eq!(
            place(rect(0, 1000), &[rect(0, 630), rect(790, 1000)], 96)
                .unwrap()
                .width(),
            144
        );
    }

    #[test]
    fn merges_overlapping_controls_and_preserves_negative_monitor_coordinates() {
        let bar = rect(-1920, 0);
        let occupied = [rect(-1920, -1400), rect(-1500, -1200), rect(-240, 0)];
        let result = place(bar, &occupied, 96).unwrap();
        assert_eq!(result.width(), 144);
        assert!(result.left >= -1192 && result.right <= -248);
    }

    #[test]
    fn scales_both_width_and_height_once_for_high_dpi() {
        let bar = Rect {
            left: 0,
            top: 1536,
            right: 2880,
            bottom: 1608,
        };
        let occupied = [
            Rect {
                left: 0,
                right: 1680,
                ..bar
            },
            Rect {
                left: 2550,
                right: 2880,
                ..bar
            },
        ];
        let result = place(bar, &occupied, 144).unwrap();
        assert_eq!(result.width(), 216);
        assert_eq!(result.height(), 60);
        assert!(result.right <= 2538);
    }

    #[test]
    fn dynamic_player_width_scales_once_and_is_part_of_clearance_validation() {
        let bar = rect(0, 2560);
        let occupied = [rect(0, 1721), rect(2251, 2560)];
        for logical_width in [108, 144, 176, 220] {
            let result = place_sized(bar, &occupied, 96, logical_width).unwrap();
            assert_eq!(result.width(), logical_width);
            assert_eq!(2251 - result.right, 16);
            assert!(still_clear_sized(bar, &occupied, 96, result, logical_width,));
            if logical_width != 144 {
                assert!(!still_clear(bar, &occupied, 96, result));
            }
        }
    }

    #[test]
    fn refuses_invalid_vertical_or_too_short_bars_and_unknown_dpi() {
        assert!(place(
            Rect {
                left: 0,
                top: 0,
                right: 48,
                bottom: 1080
            },
            &[],
            96
        )
        .is_none());
        assert!(place(
            Rect {
                left: 0,
                top: 0,
                right: 1920,
                bottom: 30
            },
            &[],
            96
        )
        .is_none());
        assert!(place(rect(0, 1920), &[], 0).is_none());
    }

    #[test]
    fn rejects_stale_placement_when_app_buttons_expand_into_it() {
        let bar = rect(0, 1920);
        let candidate = place(bar, &[rect(0, 1120), rect(1700, 1920)], 96).unwrap();
        assert!(still_clear(
            bar,
            &[rect(0, 1120), rect(1700, 1920)],
            96,
            candidate
        ));
        assert!(!still_clear(
            bar,
            &[rect(0, 1600), rect(1700, 1920)],
            96,
            candidate
        ));
    }

    #[test]
    fn preserves_minimum_height_on_a_small_taskbar() {
        let bar = Rect {
            left: 0,
            top: 1048,
            right: 1920,
            bottom: 1080,
        };
        let result = place(bar, &[], 96).unwrap();
        assert_eq!(result.height(), 32);
        assert_eq!(result.top, bar.top);
    }

    #[test]
    fn distinguishes_render_surfaces_from_controls_and_app_hosts() {
        assert!(is_render_host(
            "Windows.UI.Composition.DesktopWindowContentBridge"
        ));
        assert!(is_render_host("Windows.UI.Core.CoreWindow"));
        assert!(!is_render_host("TrayNotifyWnd"));
        assert!(!is_render_host("ToolbarWindow32"));
        assert!(is_app_host("MSTaskListWClass"));
        assert!(!is_app_host("Start"));
    }

    #[test]
    fn classic_host_tail_requires_confirmed_app_button_descendants() {
        let bar = rect(0, 1804);
        let host = rect(60, 1510);
        let tray = rect(1510, 1804);
        assert!(place(bar, &[app_guard(bar, host, &[]), tray], 96).is_none());
        let buttons = [rect(60, 104), rect(946, 990)];
        let guard = app_guard(bar, host, &buttons);
        let result = place(bar, &[guard, tray], 96).unwrap();
        assert_eq!(
            result,
            Rect {
                left: 1350,
                right: 1494,
                top: 1036,
                bottom: 1076
            }
        );
        assert!(still_clear(bar, &[guard, tray], 96, result));
        // A tray button or a stale/out-of-host rectangle cannot authorize using
        // a stretched app host's tail.
        assert_eq!(app_guard(bar, host, &[rect(1510, 1554)]).right, host.right);
    }
}
