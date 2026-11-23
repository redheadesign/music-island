type ThemeRole = `--${'surface' | 'fg' | 'control' | 'font' | 'space' | 'radius' | 'text' | 'leading' | 'weight' | 'shadow' | 'status' | 'focus' | 'hit' | 'motion' | 'glass' | 'island'}-${string}`
export type ThemeRoles = Partial<Record<ThemeRole, string>>

export type ThemeDefinition = {
  label: { ru: string; en: string }
  material: 'classic' | 'glass'
  roles?: ThemeRoles
  playbackWave?: boolean
}

export const INTERFACE_THEMES = {
  classic: { label: { ru: 'Классическая', en: 'Classic' }, material: 'classic' },
  glass: {
    label: { ru: 'Стекло', en: 'Glass' },
    material: 'glass',
    roles: {
      '--font-sans': '"Segoe UI Variable Text", "Segoe UI", ui-sans-serif, system-ui, sans-serif',
      '--radius-unit': '6px',
      '--island-button-fill': 'rgb(var(--glass-ink) / .08)',
      '--island-floating-fill': 'rgb(42 44 48 / .64)',
      '--island-track-fill': 'rgb(12 15 20 / .18)',
      '--island-catalog-fill': 'rgb(var(--glass-ink) / .045)',
      '--island-widget-fill': 'rgb(22 23 25 / calc(1 - .91 * var(--glass-reading-transmission)))',
      '--island-widget-ink': 'var(--fg-on-glass)',
      '--island-widget-secondary': 'var(--glass-reading-secondary)',
      '--island-widget-radius': 'var(--glass-panel-radius)',
      '--island-capsule-radius': 'var(--radius-pill)',
    },
    playbackWave: true,
  },
} satisfies Record<string, ThemeDefinition>

export type InterfaceThemeId = keyof typeof INTERFACE_THEMES
export const DEFAULT_INTERFACE_THEME: InterfaceThemeId = 'glass'

export const INTERFACE_THEME_IDS = Object.keys(INTERFACE_THEMES) as InterfaceThemeId[]

export function isInterfaceThemeId(value: unknown): value is InterfaceThemeId {
  return typeof value === 'string' && Object.hasOwn(INTERFACE_THEMES, value)
}

export function normalizeInterfaceTheme(value: unknown): InterfaceThemeId {
  return isInterfaceThemeId(value)
    ? value
    : DEFAULT_INTERFACE_THEME
}

export function getInterfaceThemeDefinition(theme: InterfaceThemeId): ThemeDefinition {
  return INTERFACE_THEMES[theme]
}
