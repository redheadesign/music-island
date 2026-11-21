import { createTranslator, type MessageKey } from '../../shared/i18n/messages'
import { DEFAULT_GLASS_MATERIAL, type GlassMaterial } from '../../shared/lib/glassMaterialTokens'
import type { Locale } from '../../shared/lib/types'
import { RangeSlider } from '../../shared/ui/RangeSlider'
import { Button } from '../../shared/ui/SettingsControls'
import { SettingsDisclosure } from '../../shared/ui/SettingsDisclosure'
import './GlassMaterialSettings.css'

const controls = [
  ['transparency', 'settings.glassTransparency'],
  ['frost', 'settings.glassFrost'],
  ['parallax', 'settings.glassParallax'],
  ['highlight', 'settings.glassHighlight'],
  ['edge', 'settings.glassEdge'],
] as const satisfies ReadonlyArray<readonly [keyof GlassMaterial, MessageKey]>

interface GlassMaterialSettingsProps {
  locale: Locale
  material: GlassMaterial
  onChange: (material: GlassMaterial) => void
  onReset?: () => void
  bodyFrostOverride?: number
}

export function GlassMaterialSettings({ locale, material, onChange, onReset, bodyFrostOverride }: GlassMaterialSettingsProps) {
  const t = createTranslator(locale)
  const custom = controls.some(([key]) => material[key] !== DEFAULT_GLASS_MATERIAL[key])
  const title = t('settings.glassMaterial')
  return <SettingsDisclosure title={title} summary={t(custom ? 'settings.glassCustom' : 'settings.glassDefault')}>
    <div className="glass-material-settings" role="group" aria-label={title}>
      {controls.map(([key, label]) => <label key={key} className="glass-material-settings__row">
        <span>{t(label)}</span>
        <RangeSlider aria-label={t(label)} aria-valuetext={`${material[key]}%`} min={0} max={100} step={1}
          value={material[key]} onChange={event => onChange({ ...material, [key]: event.currentTarget.valueAsNumber })} />
        <output aria-hidden="true">{material[key]}%</output>
      </label>)}
      {bodyFrostOverride !== undefined && <small className="glass-material-settings__note">{locale === 'ru'
        ? `У корпуса своё размытие (${bodyFrostOverride.toLocaleString('ru')} px) в продвинутых настройках.`
        : `The island body uses its own blur (${bodyFrostOverride.toLocaleString('en')} px) in Advanced settings.`}</small>}
      <Button variant="ghost" size="compact" aria-label={t('settings.glassReset')} disabled={!custom}
        onClick={onReset ?? (() => onChange(DEFAULT_GLASS_MATERIAL))}>{t('settings.reset')}</Button>
    </div>
  </SettingsDisclosure>
}
