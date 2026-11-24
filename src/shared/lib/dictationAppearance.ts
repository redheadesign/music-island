import type { AppConfig } from './types'
import { normalizeGlassMaterial, type GlassMaterial } from './glassMaterial'
import { isInterfaceThemeId, type InterfaceThemeId } from './interfaceTheme'
import { getUiPrefs } from './uiPrefs'
import { normalizeDictationShader, shaderOverrides, type DictationShaderTuning } from './shaderTuning'

export const dictationThemes = ['pixels', 'wave', 'classic'] as const
export const dictationPalettes = ['accent', 'white', 'prism', 'aurora', 'lagoon', 'sakura', 'ember', 'dune'] as const

export interface DictationAppearance {
  theme: typeof dictationThemes[number]
  palette: typeof dictationPalettes[number]
  chromatic: boolean
  /** No override means that the recording capsule follows the island. */
  materialTheme?: InterfaceThemeId
  glassMaterial?: GlassMaterial
  shaderTuning?: Partial<DictationShaderTuning>
}

export const defaultDictationAppearance: DictationAppearance = {
  theme: 'pixels', palette: 'accent', chromatic: false,
}

export const DEFAULT_DICTATION_GLASS: Readonly<GlassMaterial> = {
  transparency: 90, frost: 85, parallax: 91, highlight: 42, edge: 50,
}

export function dictationGlassMaterial(appearance: DictationAppearance, islandGlass: GlassMaterial): GlassMaterial {
  return appearance.materialTheme === 'glass' ? appearance.glassMaterial ?? DEFAULT_DICTATION_GLASS : islandGlass
}

function choice<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback
}

export function normalizeDictationAppearance(value: unknown): DictationAppearance {
  const raw = value && typeof value === 'object' ? value as Partial<DictationAppearance> : {}
  const shader = shaderOverrides(raw.shaderTuning, normalizeDictationShader(raw.shaderTuning))
  return {
    theme: choice(raw.theme, dictationThemes, defaultDictationAppearance.theme),
    palette: choice(raw.palette, dictationPalettes, 'accent'),
    chromatic: raw.chromatic === true,
    ...(Object.keys(shader).length && { shaderTuning: shader }),
    ...(isInterfaceThemeId(raw.materialTheme) && { materialTheme: raw.materialTheme }),
    ...(raw.glassMaterial && typeof raw.glassMaterial === 'object' && !Array.isArray(raw.glassMaterial)
      && { glassMaterial: normalizeGlassMaterial(raw.glassMaterial, DEFAULT_DICTATION_GLASS) }),
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
