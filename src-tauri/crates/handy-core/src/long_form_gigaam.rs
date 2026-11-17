//! GigaAM's short-utterance encoder is trained on at most 25 seconds.
//! Find real pauses before sending long input to it, without dropping samples.

use std::ops::Range;

const SAMPLES_PER_SECOND: usize = 16_000;
const MAX_CHUNK: usize = 25 * SAMPLES_PER_SECOND;
const TARGET_CHUNK: usize = 17 * SAMPLES_PER_SECOND;
const MIN_CHUNK: usize = 12 * SAMPLES_PER_SECOND;
const MIN_TAIL: usize = 2 * SAMPLES_PER_SECOND;
const PAUSE_SAMPLES: usize = SAMPLES_PER_SECOND * 120 / 1000;
const SEARCH_STEP: usize = SAMPLES_PER_SECOND * 20 / 1000;
const QUIET_RMS: f32 = 0.008;
const MIN_DROP_IN_POWER: f32 = 64.0;

/// Search only complete windows. Anything returned here is the same first cut
/// as the offline planner for every possible continuation of this recording.
#[derive(Default)]
pub(crate) struct SealedPause {
    searched: usize,
}

impl SealedPause {
    pub(crate) fn next(&mut self, pending: &[f32]) -> Option<usize> {
        loop {
            let (start, end, target) = if self.searched == 0 {
                (MIN_CHUNK, MAX_CHUNK, TARGET_CHUNK - MIN_CHUNK)
            } else {
                (
                    self.searched - PAUSE_SAMPLES,
                    self.searched + MAX_CHUNK - MIN_CHUNK,
                    0,
                )
            };
            if pending.len() < end + MIN_TAIL {
                return None;
            }
            self.searched = end;
            if let Some(offset) = find_pause(&pending[start..end], target) {
                self.searched = 0;
                return Some(start + offset);
            }
        }
    }
}

/// Prefer the trained utterance window. Keep a longer continuous passage intact
/// until a real pause, preserving adjacent short utterances and every sample.
pub(crate) fn pause_ranges(audio: &[f32]) -> Option<Vec<Range<usize>>> {
    if audio.len() <= MAX_CHUNK {
        return None;
    }

    let mut start = 0;
    let mut ranges = Vec::new();
    while audio.len() - start > MAX_CHUNK {
        let search_end = (start + MAX_CHUNK).min(audio.len() - MIN_TAIL);
        let search_start = start + MIN_CHUNK;
        let boundary = find_pause(&audio[search_start..search_end], TARGET_CHUNK - MIN_CHUNK)
            .map(|offset| search_start + offset)
            .or_else(|| next_pause(audio, search_end));
        let Some(boundary) = boundary else { break };
        ranges.push(start..boundary);
        start = boundary;
    }
    if ranges.is_empty() {
        return None;
    }
    ranges.push(start..audio.len());
    Some(ranges)
}

fn next_pause(audio: &[f32], previous_end: usize) -> Option<usize> {
    let limit = audio.len() - MIN_TAIL;
    let mut end = previous_end;
    while end < limit {
        // Overlap by a detector window so a quiet interval straddling two
        // scans is still recognized. Local peak power rejects soft speech.
        let start = end - PAUSE_SAMPLES;
        end = (end + MAX_CHUNK - MIN_CHUNK).min(limit);
        if let Some(offset) = find_pause(&audio[start..end], 0) {
            return Some(start + offset);
        }
    }
    None
}

fn find_pause(samples: &[f32], target: usize) -> Option<usize> {
    if samples.len() < PAUSE_SAMPLES {
        return None;
    }

    let power = |values: &[f32]| values.iter().map(|&value| value * value).sum::<f32>();
    let windows: Vec<_> = (0..=samples.len() - PAUSE_SAMPLES)
        .step_by(SEARCH_STEP)
        .map(|offset| {
            (
                offset + PAUSE_SAMPLES / 2,
                power(&samples[offset..offset + PAUSE_SAMPLES]),
            )
        })
        .collect();
    let peak_power = windows.iter().map(|&(_, power)| power).fold(0.0, f32::max);
    let ceiling =
        (QUIET_RMS * QUIET_RMS * PAUSE_SAMPLES as f32).min(peak_power / MIN_DROP_IN_POWER);
    windows
        .into_iter()
        .filter(|&(_, power)| power <= ceiling)
        .min_by_key(|&(center, _)| center.abs_diff(target))
        .map(|(center, _)| center)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECOND: usize = SAMPLES_PER_SECOND;

    fn pause(audio: &mut [f32], seconds: usize) {
        audio[seconds * SECOND - PAUSE_SAMPLES..seconds * SECOND + PAUSE_SAMPLES].fill(0.0);
    }

    #[test]
    fn short_and_exact_window_keep_one_model_call() {
        assert!(pause_ranges(&[0.0; 40]).is_none());
        assert!(pause_ranges(&vec![0.0; MAX_CHUNK]).is_none());
    }

    #[test]
    fn live_cuts_match_offline_for_every_stop_and_never_guess_the_tail() {
        let mut audio = vec![0.2; 95 * SECOND];
        for at in [16, 59, 76] {
            pause(&mut audio, at);
        }
        let mut planner = SealedPause::default();
        let mut sealed = Vec::new();
        let mut start = 0;
        for end in (SECOND..audio.len()).step_by(SECOND / 2 + 7) {
            while let Some(length) = planner.next(&audio[start..end]) {
                sealed.push(start..start + length);
                start += length;
            }
            let offline = pause_ranges(&audio[..end]).unwrap_or_default();
            assert!(offline.starts_with(&sealed), "unstable cut at {end}");
        }
        assert_eq!(sealed.len(), 3);
    }

    #[test]
    fn long_recording_cuts_at_pauses_without_losing_any_samples() {
        let mut audio = vec![0.2; 56 * SECOND];
        for seconds in [16, 21, 35, 43] {
            pause(&mut audio, seconds);
        }
        let ranges = pause_ranges(&audio).unwrap();
        assert_eq!(ranges.first().unwrap().start, 0);
        assert_eq!(ranges.last().unwrap().end, audio.len());
        assert!(ranges.iter().all(|range| range.len() <= MAX_CHUNK));
        assert!(ranges.windows(2).all(|pair| pair[0].end == pair[1].start));
        for range in ranges.iter().take(ranges.len() - 1) {
            assert_eq!(audio[range.end - PAUSE_SAMPLES / 2], 0.0);
            assert_eq!(audio[range.end + PAUSE_SAMPLES / 2 - 1], 0.0);
        }
        assert!(ranges[0].end.abs_diff(16 * SECOND) <= PAUSE_SAMPLES);
    }

    #[test]
    fn continuous_quiet_speech_is_not_treated_as_a_pause() {
        let audio = vec![0.002; 60 * SECOND];
        assert!(pause_ranges(&audio).is_none());
    }

    #[test]
    fn keeps_a_safe_prefix_when_the_remaining_speech_has_no_pause() {
        let mut audio = vec![0.2; 60 * SECOND];
        pause(&mut audio, 16);
        let ranges = pause_ranges(&audio).unwrap();
        assert_eq!(ranges.len(), 2);
        assert!(ranges[0].end.abs_diff(16 * SECOND) <= PAUSE_SAMPLES);
        assert_eq!(ranges[1], ranges[0].end..audio.len());
    }

    #[test]
    fn preserves_a_long_unbroken_passage_and_resumes_at_a_real_pause() {
        let mut audio = vec![0.2; 94 * SECOND];
        for seconds in [17, 60, 77] {
            pause(&mut audio, seconds);
        }
        let ranges = pause_ranges(&audio).unwrap();
        assert_eq!(ranges.len(), 4);
        assert_eq!(ranges[0].start, 0);
        assert_eq!(ranges.last().unwrap().end, audio.len());
        for (pair, second) in ranges.windows(2).zip([17, 60, 77]) {
            assert_eq!(pair[0].end, pair[1].start);
            assert!(pair[0].end.abs_diff(second * SECOND) <= PAUSE_SAMPLES);
        }
    }

    #[test]
    fn near_limit_leaves_a_useful_tail_and_ignores_brief_dips() {
        let mut audio = vec![0.2; MAX_CHUNK + 1];
        audio[17 * SECOND..17 * SECOND + SEARCH_STEP].fill(0.0);
        pause(&mut audio, 23);
        let ranges = pause_ranges(&audio).unwrap();
        assert_eq!(ranges.len(), 2);
        assert!(ranges[0].end.abs_diff(23 * SECOND) <= PAUSE_SAMPLES);
        assert!(ranges[1].len() >= MIN_TAIL);
    }
}
