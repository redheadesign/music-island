import type { AppConfig } from './types'
import { getUiPrefs } from './uiPrefs'

/** Percentages are persisted independently of the color palette and recorder artwork. */
export interface GlassMaterial {
  transparency: number
  frost: number
  parallax: number
  highlight: number
  edge: number
}

export const DEFAULT_GLASS_MATERIAL: Readonly<GlassMaterial> = {
  transparency: 55, frost: 72, parallax: 45, highlight: 50, edge: 50,
}

export function getGlassMaterial(config: AppConfig | null | undefined): GlassMaterial {
  const saved = getUiPrefs(config).glassMaterial
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

export function glassMaterialStyle(material: GlassMaterial) {
  return {
    '--glass-transparency-strength': material.transparency / 100,
    '--glass-frost-strength': material.frost / 100,
    '--glass-user-blur': `${material.frost * .32}px`,
    '--glass-user-filter': material.frost === 0 ? 'none' : 'blur(var(--glass-user-blur)) saturate(1.15)',
    '--glass-parallax-strength': material.parallax / 100,
    '--glass-highlight-strength': material.highlight / 100,
    '--glass-edge-strength': material.edge / 100,
  }
}
