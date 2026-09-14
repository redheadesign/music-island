import { useEffect, useState } from 'react'
import { getDefaultConfig } from '../app/tauriApi'
import type { Locale } from '../shared/lib/types'

export function useWorkshopConfig(
  locale: Locale,
  accent: string,
  pinned = false,
) {
  const [config, setConfig] = useState(() => {
    const base = structuredClone(getDefaultConfig())
    base.appearance.locale = locale
    base.appearance.accentColor = accent
    base.behavior.pinExpanded = pinned
    base.plugins.settings.ui = { hoverCoachCompleted: true }
    return base
  })
  useEffect(() => {
    setConfig((value) => ({
      ...value,
      appearance: { ...value.appearance, locale, accentColor: accent },
    }))
  }, [locale, accent])
  return [config, setConfig] as const
}
