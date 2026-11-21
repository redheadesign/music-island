/** Values are stored in renderer units, independent of the language of the editor. */
type Dial = readonly [min: number, max: number, step: number, initial: number]
export const dictationShaderDials = {
  waveBrightness: [0, 100, 1, 9], lightIntensity: [0, 100, 1, 28],
  amplitude: [.05, .8, .01, .22], frequency: [.25, 3, .01, 1.1], thickness: [.25, 8, .05, 3],
  speed: [0, 3, .05, 1], dotRadius: [.025, .22, .005, .1], dotGlow: [0, .25, .005, .04],
  foxBrightness: [0, 100, 1, 80],
} as const satisfies Record<string, Dial>

export const islandShaderDials = {
  waveSpeed: [.25, 3, .05, 1], waveIntensity: [0, 100, 1, 32], waveBlur: [0, 16, .25, 4],
  waveReach: [1, 4, .01, 2.68], bassGain: [0, 3, .05, 1],
  particleCount: [0, 24, 1, 9], particleSpeed: [.25, 3, .05, 1],
  particleSize: [.25, 3, .05, 1], particleFall: [.25, 3, .05, 1], particleBrightness: [0, 100, 1, 65],
  foxSpeed: [0, 3, .05, 1], foxOpacity: [0, 100, 1, 100],
} as const satisfies Record<string, Dial>

export type DictationShaderTuning = Record<keyof typeof dictationShaderDials, number>
export type IslandShaderTuning = Record<keyof typeof islandShaderDials, number> & {
  waveColor: string | null; particleColor: string | null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readDials<K extends string>(schema: Record<K, Dial>, raw: Record<string, unknown>): Record<K, number> {
  const result = {} as Record<K, number>
  for (const key of Object.keys(schema) as K[]) {
    const [min, max, step, initial] = schema[key]
    const value = raw[key]
    const bounded = typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : initial
    result[key] = Number((min + Math.round((bounded - min) / step) * step).toFixed(3))
  }
  return result
}

function color(value: unknown) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null
}

export function normalizeDictationShader(value: unknown): DictationShaderTuning {
  return readDials(dictationShaderDials, record(value))
}
export const DEFAULT_DICTATION_SHADER = normalizeDictationShader(null)

/** Preserve inheritance when an older profile contains just a few controls. */
export function shaderOverrides<T extends object>(value: unknown, effective: T): Partial<T> {
  const raw = record(value)
  const out: Partial<T> = {}
  for (const key of Object.keys(effective) as (keyof T & string)[]) {
    if (!Object.hasOwn(raw, key)) continue
    const input = raw[key]
    const valid = typeof effective[key] === 'number' ? typeof input === 'number' && Number.isFinite(input) : color(input) !== null
    if (valid) out[key] = effective[key]
  }
  return out
}

export function normalizeIslandShader(value: unknown): IslandShaderTuning {
  const raw = record(value)
  return { ...readDials(islandShaderDials, raw), waveColor: color(raw.waveColor), particleColor: color(raw.particleColor) }
}
