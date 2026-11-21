import { createTranslator, type MessageKey } from '../../shared/i18n/messages'
import { DEFAULT_GLASS_MATERIAL, getGlassMaterial, type GlassMaterial } from '../../shared/lib/glassMaterial'
import { getInterfaceThemeDefinition, INTERFACE_THEME_IDS, INTERFACE_THEMES } from '../../shared/lib/interfaceTheme'
import type { AppConfig, Locale } from '../../shared/lib/types'
import { getInterfaceTheme, getPlaybackWaveEnabled, withUiPrefs } from '../../shared/lib/uiPrefs'
import { AppearanceChoices } from './AppearanceChoices'
import { Button, Switch } from '../../shared/ui/SettingsControls'
import { RangeSlider } from '../../shared/ui/RangeSlider'
import './GlassMaterialSettings.css'

type AppearanceProps = {
  config: AppConfig
  locale: Locale
  onChange: (config: AppConfig) => void
}

export function InterfaceThemePicker({ config, locale, onChange }: AppearanceProps) {
  const t = createTranslator(locale)
  const theme = getInterfaceTheme(config)
  return <AppearanceChoices
    label={t('settings.interfaceTheme')}
    value={theme}
    options={INTERFACE_THEME_IDS.map(id => ({
      value: id,
      label: INTERFACE_THEMES[id].label[locale],
      swatch: <span aria-hidden="true" className="appearance-choices__swatch appearance-choices__material" data-interface-theme={id} />,
    }))}
    onChange={interfaceTheme => onChange(withUiPrefs(config, { interfaceTheme }))}
  />
}

export function InterfaceAppearanceSettings({ config, locale, onChange }: AppearanceProps) {
  const t = createTranslator(locale)
  const theme = getInterfaceTheme(config)
  const definition = getInterfaceThemeDefinition(theme)
  return <>
    {definition.material === 'glass' && <GlassMaterialSettings config={config} locale={locale} onChange={onChange} />}
    {definition.playbackWave && <Switch
      label={t('settings.playbackWave')}
      hint={t('settings.playbackWaveHint')}
      checked={getPlaybackWaveEnabled(config)}
      onChange={playbackWaveEnabled => onChange(withUiPrefs(config, { playbackWaveEnabled }))}
    />}
  </>
}

const glassControls = [
  ['transparency', 'settings.glassTransparency'],
  ['frost', 'settings.glassFrost'],
  ['parallax', 'settings.glassParallax'],
  ['highlight', 'settings.glassHighlight'],
  ['edge', 'settings.glassEdge'],
] as const satisfies ReadonlyArray<readonly [keyof GlassMaterial, MessageKey]>

function GlassMaterialSettings({ config, locale, onChange }: AppearanceProps) {
  const t = createTranslator(locale)
  const material = getGlassMaterial(config)
  const modified = glassControls.some(([key]) => material[key] !== DEFAULT_GLASS_MATERIAL[key])
  return <div className="glass-material-settings" role="group" aria-label={t('settings.glassMaterial')}>
    <div className="glass-material-settings__header">
      <strong>{t('settings.glassMaterial')}</strong>
      <Button variant="ghost" size="compact" aria-label={t('settings.glassReset')} disabled={!modified}
        onClick={() => onChange(withUiPrefs(config, { glassMaterial: DEFAULT_GLASS_MATERIAL }))}>{t('settings.reset')}</Button>
    </div>
    <div className="glass-material-settings__sliders">
      {glassControls.map(([key, label]) => <label key={key}>
        <span>{t(label)}</span><output aria-hidden="true">{material[key]}%</output>
        <RangeSlider aria-label={t(label)} aria-valuetext={`${material[key]}%`} min={0} max={100} step={1} value={material[key]}
          onChange={event => onChange(withUiPrefs(config, { glassMaterial: { ...material, [key]: event.currentTarget.valueAsNumber } }))} />
      </label>)}
    </div>
  </div>
}
