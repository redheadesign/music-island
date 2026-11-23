import type { GlassMaterial } from './glassMaterialTokens'

export interface DesktopLens {
  bend: number
  dispersion: number
}

export type DesktopGlassMode = 'lens' | 'snapshot' | 'system'

export function normalizeDesktopGlassMode(value: unknown): DesktopGlassMode {
  return value === 'system' || value === 'snapshot' ? value : 'lens'
}

export const DESKTOP_LENS_DEFAULTS: Readonly<DesktopLens> = { bend: .46, dispersion: .14 }

export function normalizeDesktopLens(value?: Partial<DesktopLens>): DesktopLens {
  const dial = (key: keyof DesktopLens) => {
    const input = value?.[key]
    return typeof input === 'number' && Number.isFinite(input) ? Math.min(1, Math.max(0, input)) : DESKTOP_LENS_DEFAULTS[key]
  }
  return { bend: dial('bend'), dispersion: dial('dispersion') }
}

export const GLASS_SURFACE_IDS = [
  'body', 'transport', 'buttons', 'usage',
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
  brightness: number
}

export type AdvancedGlassOverrides = Partial<Record<GlassSurfaceId, Partial<GlassSurfaceSettings>>>

const defaultSurfacePaint: Partial<Record<GlassSurfaceId, string>> = {
  body: '#303134',
  progressTrack: '#0c0f14',
  progressFill: '#696b71',
}

export function getSurfaceDefaults(id: GlassSurfaceId, base: GlassMaterial): GlassSurfaceSettings {
  const nested = ['transport', 'buttons', 'progressTrack', 'progressFill'].includes(id)
  return {
    bend: 0, dispersion: 0, frost: nested ? 0 : Math.round(base.frost * .32 * 10) / 10,
    rim: .13, transparency: id === 'progressFill' ? 0 : base.transparency,
    parallax: base.parallax, highlight: base.highlight, edge: base.edge,
    background: defaultSurfacePaint[id] ?? '#080808', text: '#f4f4f1',
    height: 64, radius: 32, textSize: 18, brightness: 100,
  }
}

const optics = ['bend', 'dispersion', 'frost'] as const
const plate = ['frost', 'transparency', 'background', 'text'] as const
const control = [...optics, 'rim', 'transparency', 'parallax', 'highlight', 'edge', 'background', 'text'] as const
export const GLASS_SURFACE_FIELDS: Record<GlassSurfaceId, readonly (keyof GlassSurfaceSettings)[]> = {
  body: ['frost', 'transparency', 'background', 'text'],
  transport: control, buttons: control, usage: plate, localServers: plate, latestDictation: plate,
  notices: plate, progressTrack: [...control, 'height', 'radius', 'textSize'],
  progressFill: ['radius', 'brightness'],
  dictation: ['bend', 'dispersion', ...plate], dictationActions: control,
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
  brightness: { min: 20, max: 180, step: 1, unit: '%' },
}

/** Only finite bounded numbers and opaque sRGB colors enter CSS or the compositor. */
export function normalizeAdvancedGlass(value: unknown): AdvancedGlassOverrides {
  const result: AdvancedGlassOverrides = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result
  const groups = value as Record<string, unknown>
  // Play/pause retains the original transport settings. A saved shared
  // material takes precedence over the old button-specific overrides.
  const buttons = groups.buttons ?? Object.assign({}, groups.seek, groups.modes, groups.volume, groups.actions, groups.reactions)
  for (const group of GLASS_SURFACE_IDS) {
    const raw = group === 'buttons' ? buttons : groups[group]
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const record = raw as Record<string, unknown>
    const fields: Partial<GlassSurfaceSettings> = {}
    for (const key of GLASS_SURFACE_FIELDS[group]) {
      const input = record[key]
      if (key === 'background' || key === 'text') {
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
