type ThemeRole = `--${'surface' | 'fg' | 'control' | 'font' | 'space' | 'radius' | 'text' | 'leading' | 'weight' | 'shadow' | 'status' | 'focus' | 'hit' | 'motion' | 'glass'}-${string}`
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
