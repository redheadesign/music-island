import type { ReactNode } from 'react'
import { createTranslator } from '../../shared/i18n/messages'
import { normalizeHexColor } from '../../shared/lib/accentTheme'
import { INTERFACE_PALETTES, INTERFACE_PALETTE_IDS, type InterfacePaletteId } from '../../shared/lib/interfacePalette'
import type { Locale } from '../../shared/lib/types'
import { AppearanceChoices } from './AppearanceChoices'

export function InterfacePalettePicker({ value, onChange, customAccent, locale, children }: {
  value: InterfacePaletteId
  onChange: (value: InterfacePaletteId) => void
  customAccent: string
  locale: Locale
  children?: ReactNode
}) {
  const t = createTranslator(locale)
  const options = [...INTERFACE_PALETTE_IDS, 'custom' as const].map(id => {
    const preset = id === 'custom' ? undefined : INTERFACE_PALETTES[id]
    const background = preset
      ? `linear-gradient(135deg, ${preset.primary} 50%, ${preset.secondary} 50%)`
      : normalizeHexColor(customAccent)
    return { value: id, label: preset?.label[locale] ?? t('settings.manualAccent'),
      swatch: <span className="appearance-choices__swatch" aria-hidden="true" style={{ background }} /> }
  })
  return <>
    <AppearanceChoices label={t('settings.interfacePalette')} value={value} onChange={onChange} options={options} />
    {value === 'custom' && children}
  </>
}
