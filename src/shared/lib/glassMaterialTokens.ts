import defaultAppearance from './defaultAppearance.json' with { type: 'json' }

/** Percentages are persisted independently of the color palette and recorder artwork. */
export interface GlassMaterial {
  transparency: number
  frost: number
  parallax: number
  highlight: number
  edge: number
}

export const DEFAULT_GLASS_MATERIAL: Readonly<GlassMaterial> = defaultAppearance.ui.glassMaterial

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
