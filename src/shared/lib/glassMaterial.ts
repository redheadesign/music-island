import type { AppConfig } from './types'
import { getUiPrefs } from './uiPrefs'
import { DEFAULT_GLASS_MATERIAL, type GlassMaterial } from './glassMaterialTokens'
export { DEFAULT_GLASS_MATERIAL, glassMaterialStyle, type GlassMaterial } from './glassMaterialTokens'

export function getGlassMaterial(config: AppConfig | null | undefined): GlassMaterial {
  return normalizeGlassMaterial(getUiPrefs(config).glassMaterial)
}

export function normalizeGlassMaterial(saved?: Partial<GlassMaterial> | null): GlassMaterial {
  const read = (key: keyof GlassMaterial) => {
    const value = saved?.[key]
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.round(Math.max(0, Math.min(100, value)))
      : DEFAULT_GLASS_MATERIAL[key]
  }
  return {
    transparency: read('transparency'), frost: read('frost'), parallax: read('parallax'),
    highlight: read('highlight'), edge: read('edge'),
  }
}
