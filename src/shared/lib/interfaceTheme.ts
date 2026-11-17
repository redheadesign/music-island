export const INTERFACE_SCENES = ['fox', 'manta'] as const
export type InterfaceScene = typeof INTERFACE_SCENES[number]

type ThemeDefinition = {
  label: { ru: string; en: string }
  translucent?: boolean
  scene?: { fallback: InterfaceScene; options: readonly InterfaceScene[] }
}

export const INTERFACE_THEMES = {
  classic: { label: { ru: 'Классическая', en: 'Classic' } },
  glass: {
    label: { ru: 'Стекло', en: 'Glass' },
    translucent: true,
    scene: { fallback: 'fox', options: INTERFACE_SCENES },
  },
} satisfies Record<string, ThemeDefinition>

export type InterfaceThemeId = keyof typeof INTERFACE_THEMES
export const DEFAULT_INTERFACE_THEME: InterfaceThemeId = 'glass'

export const INTERFACE_THEME_IDS = Object.keys(INTERFACE_THEMES) as InterfaceThemeId[]

export function normalizeInterfaceTheme(value: unknown): InterfaceThemeId {
  return typeof value === 'string' && Object.hasOwn(INTERFACE_THEMES, value)
    ? value as InterfaceThemeId
    : DEFAULT_INTERFACE_THEME
}

export function getInterfaceThemeDefinition(theme: InterfaceThemeId): ThemeDefinition {
  return INTERFACE_THEMES[theme]
}
