import { buildAccentTokens } from './accentTheme'

type PaletteColors = { primary: string; secondary: string; canvas: string }
type Palette = { label: { en: string; ru: string }; light: PaletteColors; dark: PaletteColors }

/** Accent and action pairs adapted from the matching T3 Code color themes. */
export const INTERFACE_PALETTES = {
  't3-chat': {
    label: { en: 'T3 Chat', ru: 'T3 Chat' },
    light: { primary: '#db2777', secondary: '#88305e', canvas: '#fdf7fd' },
    dark: { primary: '#db2777', secondary: '#f1c4e6', canvas: '#1f1a24' },
  },
  grove: {
    label: { en: 'Grove', ru: 'Роща' },
    light: { primary: '#1b7d50', secondary: '#8f6410', canvas: '#f3f7f4' },
    dark: { primary: '#69d69a', secondary: '#e3b34e', canvas: '#1b2821' },
  },
  ocean: {
    label: { en: 'Ocean', ru: 'Океан' },
    light: { primary: '#2672af', secondary: '#0a6f75', canvas: '#f5f7f8' },
    dark: { primary: '#70b9ee', secondary: '#5bd0d6', canvas: '#17212b' },
  },
  ember: {
    label: { en: 'Ember', ru: 'Угли' },
    light: { primary: '#ae552a', secondary: '#b23535', canvas: '#f9f7f5' },
    dark: { primary: '#f09a64', secondary: '#f78a7a', canvas: '#291e1a' },
  },
  iris: {
    label: { en: 'Iris', ru: 'Ирис' },
    light: { primary: '#7253b9', secondary: '#a82c87', canvas: '#f8f7f9' },
    dark: { primary: '#9d7df2', secondary: '#f099d8', canvas: '#1d1929' },
  },
  'silver-glass': {
    label: { en: 'Silver Glass', ru: 'Серебро' },
    light: { primary: '#374151', secondary: '#5f6368', canvas: '#e6e7e9' },
    dark: { primary: '#d4d7dd', secondary: '#a1a1aa', canvas: '#17181a' },
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

export function buildInterfacePaletteStyle(id: InterfacePaletteId, scheme: 'light' | 'dark', customAccent: string) {
  const palette = id === 'custom' ? undefined : INTERFACE_PALETTES[id][scheme]
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
