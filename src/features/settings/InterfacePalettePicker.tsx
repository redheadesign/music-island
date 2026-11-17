import { useId, type CSSProperties } from 'react'
import { createTranslator } from '../../shared/i18n/messages'
import { normalizeHexColor } from '../../shared/lib/accentTheme'
import { INTERFACE_PALETTES, INTERFACE_PALETTE_IDS, type InterfacePaletteId } from '../../shared/lib/interfacePalette'
import type { Locale } from '../../shared/lib/types'
import { Button } from '../../shared/ui/SettingsControls'
import './InterfacePalettePicker.css'

export function InterfacePalettePicker({ value, onChange, customAccent, locale }: {
  value: InterfacePaletteId
  onChange: (value: InterfacePaletteId) => void
  customAccent: string
  locale: Locale
}) {
  const label = useId()
  const t = createTranslator(locale)
  return (
    <div className="interface-palette-picker">
      <strong id={label}>{t('settings.interfacePalette')}</strong>
      <div className="interface-palette-picker__options" role="group" aria-labelledby={label}>
        {INTERFACE_PALETTE_IDS.map(id => {
          const palette = INTERFACE_PALETTES[id]
          return (
            <Button key={id} className="interface-palette-picker__option" aria-pressed={value === id} onClick={() => onChange(id)}>
              <span className="interface-palette-picker__swatches" aria-hidden="true">
                {(['light', 'dark'] as const).map(scheme => (
                  <span key={scheme} className="interface-palette-picker__swatch" data-scheme={scheme} style={{
                    '--palette-preview-first': palette[scheme].primary,
                    '--palette-preview-second': palette[scheme].secondary,
                    '--palette-preview-base': palette[scheme].canvas,
                  } as CSSProperties} />
                ))}
              </span>
              <span>{palette.label[locale]}</span>
            </Button>
          )
        })}
        <Button className="interface-palette-picker__option" aria-pressed={value === 'custom'} onClick={() => onChange('custom')}>
          <span className="interface-palette-picker__swatches" aria-hidden="true">
            <span className="interface-palette-picker__swatch interface-palette-picker__swatch--custom" style={{ backgroundColor: normalizeHexColor(customAccent) }} />
          </span>
          <span>{t('settings.manualAccent')}</span>
        </Button>
      </div>
    </div>
  )
}
