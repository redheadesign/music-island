import { useEffect, useState } from 'react'
import { getDefaultConfig } from '../app/tauriApi'
import type { Locale } from '../shared/lib/types'
import { DEFAULT_INTERFACE_THEME, type InterfaceThemeId } from '../shared/lib/interfaceTheme'
import { withUiPrefs } from '../shared/lib/uiPrefs'

export function useWorkshopConfig(
  locale: Locale,
  accent: string,
  pinned = false,
  interfaceTheme: InterfaceThemeId = DEFAULT_INTERFACE_THEME,
  factoryAppearance = false,
) {
  const [config, setConfig] = useState(() => {
    const base = structuredClone(getDefaultConfig())
    base.appearance.locale = locale
    base.appearance.accentColor = accent
    base.behavior.pinExpanded = pinned
    if (!factoryAppearance) {
      // Component scenarios select their own material and control layout.
      base.layout.width = base.layout.scale = 100
      base.plugins.settings.ui = {}
    }
    return withUiPrefs(base, { hoverCoachCompleted: true, interfaceTheme })
  })
  useEffect(() => {
    setConfig((value) => ({
      ...value,
      appearance: { ...value.appearance, locale, accentColor: accent },
    }))
  }, [locale, accent])
  useEffect(() => {
    setConfig((value) => withUiPrefs(value, { interfaceTheme }))
  }, [interfaceTheme])
  return [config, setConfig] as const
}
