import type { GlassMaterial } from './glassMaterialTokens'

export const GLASS_SURFACE_IDS = [
  'body', 'transport', 'seek', 'reactions', 'modes', 'volume', 'actions', 'usage',
  'localServers', 'latestDictation', 'notices', 'progressTrack', 'progressFill', 'dictation', 'dictationActions',
] as const
export type GlassSurfaceId = typeof GLASS_SURFACE_IDS[number]

export interface GlassSurfaceSettings {
  bend: number
  dispersion: number
  frost: number
  rim: number
  transparency: number
  parallax: number
  highlight: number
  edge: number
  background: string
  text: string
  height: number
  radius: number
  textSize: number
  endColor: string
  angle: number
}

export type AdvancedGlassOverrides = Partial<Record<GlassSurfaceId, Partial<GlassSurfaceSettings>>>

export function getSurfaceDefaults(id: GlassSurfaceId, base: GlassMaterial): GlassSurfaceSettings {
  const nested = ['transport', 'seek', 'reactions', 'modes', 'volume', 'progressTrack', 'progressFill'].includes(id)
  return {
    bend: 0, dispersion: 0, frost: nested ? 0 : Math.round(base.frost * .32 * 10) / 10,
    rim: .13, transparency: id === 'progressFill' ? 0 : base.transparency,
    parallax: base.parallax, highlight: base.highlight, edge: base.edge,
    background: id === 'progressFill' ? '#6d6d69' : '#080808', text: '#f4f4f1',
    height: 64, radius: 32, textSize: 18, endColor: '#696965', angle: 90,
  }
}

const optics = ['bend', 'dispersion', 'frost'] as const
const plate = [...optics, 'transparency', 'background', 'text'] as const
const control = [...optics, 'rim', 'transparency', 'parallax', 'highlight', 'edge', 'background', 'text'] as const
export const GLASS_SURFACE_FIELDS: Record<GlassSurfaceId, readonly (keyof GlassSurfaceSettings)[]> = {
  body: ['frost', 'transparency', 'background', 'text'],
  transport: control, seek: control, reactions: control, modes: control,
  volume: control, actions: control, usage: plate, localServers: plate, latestDictation: plate,
  notices: plate, progressTrack: [...control, 'height', 'radius', 'textSize'],
  progressFill: [...optics, 'transparency', 'background', 'endColor', 'angle', 'radius'],
  dictation: plate, dictationActions: control,
}

const fraction = { min: 0, max: 1, step: .01, unit: '' }
const percent = { min: 0, max: 100, step: 1, unit: '%' }
export const GLASS_NUMERIC_RANGES = {
  bend: fraction, dispersion: fraction, rim: fraction,
  frost: { min: 0, max: 32, step: .1, unit: 'px' },
  transparency: percent, parallax: percent, highlight: percent, edge: percent,
  radius: { min: 0, max: 48, step: 1, unit: 'px' },
  height: { min: 24, max: 72, step: 1, unit: 'px' },
  textSize: { min: 10, max: 24, step: 1, unit: 'px' },
  angle: { min: 0, max: 360, step: 1, unit: '°' },
}

/** Only finite bounded numbers and opaque sRGB colors enter CSS or the compositor. */
export function normalizeAdvancedGlass(value: unknown): AdvancedGlassOverrides {
  const result: AdvancedGlassOverrides = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result
  for (const group of GLASS_SURFACE_IDS) {
    const raw: unknown = (value as Record<string, unknown>)[group]
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const record = raw as Record<string, unknown>
    const fields: Partial<GlassSurfaceSettings> = {}
    for (const key of GLASS_SURFACE_FIELDS[group]) {
      const input = record[key]
      if (key === 'background' || key === 'text' || key === 'endColor') {
        if (typeof input === 'string' && /^#[0-9a-f]{6}$/i.test(input)) fields[key] = input.toLowerCase()
        continue
      }
      if (typeof input !== 'number' || !Number.isFinite(input)) continue
      const { min, max, step } = GLASS_NUMERIC_RANGES[key]
      fields[key] = Number((Math.round(Math.min(max, Math.max(min, input)) / step) * step).toFixed(2))
    }
    if (Object.keys(fields).length) result[group] = fields
  }
  return result
}
