import type { AppConfig } from './types'
import { getUiPrefs } from './uiPrefs'

export const dictationThemes = ['pixels', 'wave', 'classic'] as const
export const dictationPalettes = ['accent', 'white', 'prism', 'aurora', 'lagoon', 'sakura', 'ember', 'dune'] as const

export interface DictationAppearance {
  theme: typeof dictationThemes[number]
  palette: typeof dictationPalettes[number]
  chromatic: boolean
}

export const defaultDictationAppearance: DictationAppearance = {
  theme: 'pixels', palette: 'accent', chromatic: false,
}

/** Fixed artwork tuning; old per-profile controls no longer affect the recorder. */
export const dictationArtworkDefaults = { brightness: 80, waveBrightness: 9, lightIntensity: 28 } as const

function choice<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback
}

export function normalizeDictationAppearance(value: unknown): DictationAppearance {
  const raw = value && typeof value === 'object' ? value as Partial<DictationAppearance> : {}
  return {
    theme: choice(raw.theme, dictationThemes, defaultDictationAppearance.theme),
    palette: choice(raw.palette, dictationPalettes, 'accent'),
    chromatic: raw.chromatic === true,
  }
}

export function getDictationAppearance(config: AppConfig | null | undefined): DictationAppearance {
  return normalizeDictationAppearance(getUiPrefs(config).dictationAppearance)
}

/** These accents belong to the recorder artwork; settings surfaces use DS tokens. */
export const dictationPaletteColors: Record<DictationAppearance['palette'], string> = {
  accent: 'var(--accent, #f76100)', white: '#ffffff', prism: '#b7a5ff', aurora: '#9fe1bd',
  lagoon: '#6bd8ff', sakura: '#ef9ac2', ember: '#ffb078', dune: '#e4ca91',
}

export const dictationPaletteSwatches: Record<DictationAppearance['palette'], string> = {
  accent: 'var(--accent, #f76100)', white: '#ffffff', prism: '#5e6ad2', aurora: '#36aeb7',
  lagoon: '#3987e8', sakura: '#d36d99', ember: '#c89442', dune: '#b59871',
}
