/** Persist voice panel state between app launches (localStorage). */

export type SessionSnapshot = {
  version: 1 | 2;
  enabled: boolean;
  strength: number;
  model: string;
  inputDevice: string;
  outputDevice: string;
  monitorEnabled: boolean;
  monitorPoint: number;
  eqEnabled: boolean;
  eqBands: number[];
  agcEnabled: boolean;
  agcTarget: number;
  micGain: number;
  presetId: string | null;
  fxIntensity: number;
  /** Last known engine state — restore on next app launch. */
  engineRunning?: boolean;
};

const KEY = "better-voice-session";

export function loadSession(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionSnapshot;
    if (parsed?.version !== 1 && parsed?.version !== 2) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(snapshot: SessionSnapshot) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...snapshot, version: 2 }));
  } catch {
    /* quota / private mode */
  }
}
