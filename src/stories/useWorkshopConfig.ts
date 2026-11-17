import { useEffect, useState } from 'react'
import { getDefaultConfig } from '../app/tauriApi'
import type { Locale } from '../shared/lib/types'
import type { InterfaceThemeId } from '../shared/lib/interfaceTheme'
import { withUiPrefs } from '../shared/lib/uiPrefs'

export function useWorkshopConfig(
  locale: Locale,
  accent: string,
  pinned = false,
  interfaceTheme?: InterfaceThemeId,
) {
  const [config, setConfig] = useState(() => {
    const base = structuredClone(getDefaultConfig())
    base.appearance.locale = locale
    base.appearance.accentColor = accent
    base.behavior.pinExpanded = pinned
    base.plugins.settings.ui = { hoverCoachCompleted: true }
    return interfaceTheme ? withUiPrefs(base, { interfaceTheme }) : base
  })
  useEffect(() => {
    setConfig((value) => ({
      ...value,
      appearance: { ...value.appearance, locale, accentColor: accent },
    }))
  }, [locale, accent])
  useEffect(() => {
    if (interfaceTheme) setConfig((value) => withUiPrefs(value, { interfaceTheme }))
  }, [interfaceTheme])
  return [config, setConfig] as const
}
