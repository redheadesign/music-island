/** EQ presets — only change equalizer bands (game-settings Custom pattern). */

export type ScenePreset = {
  id: string;
  labelEn: string;
  labelRu: string;
  builtin?: boolean;
  eqBands: number[];
};

const FLAT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

export const DEFAULT_SCENE: ScenePreset = {
  id: "default",
  labelEn: "Default",
  labelRu: "По умолчанию",
  builtin: true,
  eqBands: [...FLAT],
};

export const BUILTIN_PRESETS: ScenePreset[] = [
  DEFAULT_SCENE,
  {
    id: "deep",
    labelEn: "Deep",
    labelRu: "Глубокий",
    builtin: true,
    eqBands: [2, 4, 3, 1, 0, -1, -2, -1, 0, -2],
  },
  {
    id: "clear",
    labelEn: "Clear",
    labelRu: "Чёткий",
    builtin: true,
    eqBands: [-3, -1, 0, 0, 1, 2, 3, 2, 1, 0],
  },
];

export const CUSTOM_PRESET_ID = "custom";

/** Engine tap points are 1–5 (0 = silent / off). */
export const MONITOR_POINTS = [
  { id: 1, labelEn: "Input", labelRu: "Вход" },
  { id: 2, labelEn: "After NS", labelRu: "После шумодава" },
  { id: 3, labelEn: "After gain", labelRu: "После усиления" },
  { id: 4, labelEn: "After equalizer", labelRu: "После эквалайзера" },
  { id: 5, labelEn: "Final", labelRu: "Финал" },
] as const;

/** Quick FX — only the ones that are actually usable. */
export const EXPLODE_EFFECTS = [
  { value: 2, key: "distortion", labelEn: "Distortion", labelRu: "Перегруз" },
  { value: 4, key: "robot", labelEn: "Robot", labelRu: "Робот" },
  { value: 6, key: "echo", labelEn: "Echo", labelRu: "Эхо" },
] as const;

const CUSTOM_KEY = "better-voice-custom-presets";

export function sceneLabel(p: ScenePreset, locale: "en" | "ru") {
  return locale === "ru" ? p.labelRu : p.labelEn;
}

export function loadCustomPresets(): ScenePreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<ScenePreset & { label?: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => ({
      id: p.id,
      labelEn: p.labelEn ?? p.label ?? "Custom",
      labelRu: p.labelRu ?? p.label ?? "Свой",
      builtin: false,
      eqBands: p.eqBands?.length === 10 ? p.eqBands : [...FLAT],
    }));
  } catch {
    return [];
  }
}

export function saveCustomPresets(presets: ScenePreset[]) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(presets));
}

export function allPresets(custom: ScenePreset[]): ScenePreset[] {
  return [...BUILTIN_PRESETS, ...custom];
}
