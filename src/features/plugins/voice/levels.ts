/**
 * Peak marks from common call/recording guidance:
 * peaks ≈ −12…−6 dBFS for speech; leave headroom below 0.
 * Sources: Discord/Zoom mic guides, Sonarworks / general gain-staging notes.
 */

/** Loud but comfortable speech on the hardware In meter (peak). */
export const IN_COMFORT_PEAK_DB = -12;

/** Shout / sing ceiling before the clip zone (peak). */
export const IN_YELL_PEAK_DB = -6;

/** Post-gain conversational target for Calls (peak). */
export const TARGET_CALLS_PEAK_DB = -18;

/** Post-gain hotter target for Content / YouTube (peak). */
export const TARGET_CONTENT_PEAK_DB = -12;

/** Legacy AGC RMS targets (Auto mode). */
export const AGC_CALLS_RMS = 0.032;
export const AGC_CONTENT_RMS = 0.08;

export function dbToLinear(db: number) {
  return Math.pow(10, db / 20);
}

export function linearToDb(v: number) {
  return 20 * Math.log10(Math.max(1e-10, v));
}

export function levelToPct(db: number) {
  const clamped = Math.max(-60, Math.min(0, db));
  return ((clamped + 60) / 60) * 100;
}
