import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createTranslator } from '../../shared/i18n/messages'
import { normalizeHexColor } from '../../shared/lib/accentTheme'
import { INTERFACE_PALETTES, INTERFACE_PALETTE_IDS, type InterfacePaletteId } from '../../shared/lib/interfacePalette'
import type { Locale } from '../../shared/lib/types'
import { Check, ChevronDown } from '../../shared/ui/SettingsIcons'
import { Button, SettingRow } from '../../shared/ui/SettingsControls'
import './InterfacePalettePicker.css'

function PaletteSwatches({ value, customAccent }: { value: InterfacePaletteId; customAccent: string }) {
  return <span className="interface-palette-picker__swatches" aria-hidden="true">
    {value === 'custom'
      ? <span className="interface-palette-picker__swatch interface-palette-picker__swatch--custom" style={{ backgroundColor: normalizeHexColor(customAccent) }} />
      : (['light', 'dark'] as const).map(scheme => {
        const colors = INTERFACE_PALETTES[value][scheme]
        return <span key={scheme} className="interface-palette-picker__swatch" data-scheme={scheme} style={{
          '--palette-preview-first': colors.primary,
          '--palette-preview-second': colors.secondary,
          '--palette-preview-base': colors.canvas,
        } as CSSProperties} />
      })}
  </span>
}

export function InterfacePalettePicker({ value, onChange, customAccent, locale, children }: {
  value: InterfacePaletteId
  onChange: (value: InterfacePaletteId) => void
  customAccent: string
  locale: Locale
  children?: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const t = createTranslator(locale)
  const label = t('settings.interfacePalette')
  const name = (palette: InterfacePaletteId) => palette === 'custom' ? t('settings.manualAccent') : INTERFACE_PALETTES[palette].label[locale]
  return <div className="interface-palette-picker">
    <SettingRow className="settings-material-picker" label={label}>
      <Button ref={trigger} className="interface-palette-picker__trigger" aria-label={label} aria-describedby={`${id}-value`}
        aria-controls={expanded ? id : undefined} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <PaletteSwatches value={value} customAccent={customAccent} />
        <span id={`${id}-value`}>{name(value)}</span><ChevronDown size={14} aria-hidden />
      </Button>
    </SettingRow>
    {expanded && <div id={id} className="interface-palette-picker__editor" onKeyDown={event => {
      if (event.key === 'Escape' && !event.defaultPrevented && !event.currentTarget.querySelector('[role="dialog"]')) {
        event.stopPropagation()
        setExpanded(false)
        trigger.current?.focus()
      }
    }}>
      <div className="interface-palette-picker__options" role="group" aria-label={label}>
        {[...INTERFACE_PALETTE_IDS, 'custom' as const].map(palette => (
          <Button key={palette} className="interface-palette-picker__option" aria-pressed={value === palette} onClick={() => onChange(palette)}>
            <PaletteSwatches value={palette} customAccent={customAccent} />
            <span>{name(palette)}</span>
            {value === palette && <Check size={14} className="interface-palette-picker__check" aria-hidden />}
          </Button>
        ))}
      </div>
      {value === 'custom' && children}
    </div>}
  </div>
}
