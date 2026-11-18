import { buildAccentTokens } from './accentTheme'

type Palette = { label: { en: string; ru: string }; primary: string; secondary: string }

/** Accent and action pairs adapted from the matching T3 Code color themes. */
export const INTERFACE_PALETTES = {
  't3-chat': {
    label: { en: 'T3 Chat', ru: 'T3 Chat' },
    primary: '#db2777', secondary: '#f1c4e6',
  },
  grove: {
    label: { en: 'Grove', ru: 'Роща' },
    primary: '#69d69a', secondary: '#e3b34e',
  },
  ocean: {
    label: { en: 'Ocean', ru: 'Океан' },
    primary: '#70b9ee', secondary: '#5bd0d6',
  },
  ember: {
    label: { en: 'Ember', ru: 'Угли' },
    primary: '#f09a64', secondary: '#f78a7a',
  },
  iris: {
    label: { en: 'Iris', ru: 'Ирис' },
    primary: '#9d7df2', secondary: '#f099d8',
  },
  'silver-glass': {
    label: { en: 'Silver Glass', ru: 'Серебро' },
    primary: '#d4d7dd', secondary: '#a1a1aa',
  },
} satisfies Record<string, Palette>

type PalettePresetId = keyof typeof INTERFACE_PALETTES
export type InterfacePaletteId = 'custom' | PalettePresetId
export const INTERFACE_PALETTE_IDS = Object.keys(INTERFACE_PALETTES) as PalettePresetId[]

export function normalizeInterfacePalette(value: unknown): InterfacePaletteId {
  return typeof value === 'string' && Object.hasOwn(INTERFACE_PALETTES, value)
    ? value as PalettePresetId
    : 'custom'
}

export function buildInterfacePaletteStyle(id: InterfacePaletteId, customAccent: string) {
  const palette = id === 'custom' ? undefined : INTERFACE_PALETTES[id]
  const accent = buildAccentTokens(palette?.primary ?? customAccent)
  const secondary = palette ? buildAccentTokens(palette.secondary) : undefined
  return {
    '--accent': accent.accent,
    '--accent-soft': secondary?.accent ?? accent.accentSoft,
    '--accent-strong': accent.accentStrong,
    '--accent-rgb': accent.accentRgb,
    '--accent-soft-rgb': secondary?.accentRgb ?? accent.accentSoftRgb,
    '--accent-glow': accent.accentGlow,
    '--accent-muted': accent.accentMuted,
    '--accent-ink': accent.accentInk,
    // A custom preview can switch before its parent window receives the same
    // config event. Reset inherited presets so the local choice wins.
    '--palette-primary': palette?.primary ?? 'initial',
    '--palette-on-primary': palette ? accent.accentInk : 'initial',
    '--palette-secondary': palette?.secondary ?? 'initial',
  }
}
