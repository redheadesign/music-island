import { createTranslator } from '../../shared/i18n/messages'
import { getGlassMaterial } from '../../shared/lib/glassMaterial'
import { normalizeAdvancedGlass } from '../../shared/lib/advancedGlass'
import { getInterfaceThemeDefinition, INTERFACE_THEME_IDS, INTERFACE_THEMES } from '../../shared/lib/interfaceTheme'
import type { AppConfig, Locale } from '../../shared/lib/types'
import { getInterfaceTheme, getPlaybackWaveEnabled, getUiPrefs, withUiPrefs } from '../../shared/lib/uiPrefs'
import { AppearanceChoices } from './AppearanceChoices'
import { Switch } from '../../shared/ui/SettingsControls'
import { GlassMaterialSettings } from './GlassMaterialSettings'
import { AdvancedGlassEditor } from './AdvancedGlassEditor'

type AppearanceProps = {
  config: AppConfig
  locale: Locale
  onChange: (config: AppConfig) => void
}

export function InterfaceThemeSettings({ config, locale, onChange }: AppearanceProps) {
  const t = createTranslator(locale)
  const theme = getInterfaceTheme(config)
  const material = getGlassMaterial(config)
  const hasGlass = getInterfaceThemeDefinition(theme).material === 'glass'
  return <>
    <AppearanceChoices
      label={t('settings.interfaceTheme')}
      value={theme}
      options={INTERFACE_THEME_IDS.map(id => ({
        value: id,
        label: INTERFACE_THEMES[id].label[locale],
        swatch: <span aria-hidden="true" className="appearance-choices__swatch appearance-choices__material" data-interface-theme={id} />,
      }))}
      onChange={interfaceTheme => onChange(withUiPrefs(config, { interfaceTheme }))}
    />
    {hasGlass && <GlassMaterialSettings
      locale={locale}
      material={material}
      bodyFrostOverride={normalizeAdvancedGlass(getUiPrefs(config).advancedGlass).body?.frost}
      onChange={glassMaterial => onChange(withUiPrefs(config, { glassMaterial }))}
      onReset={() => onChange(withUiPrefs(config, { glassMaterial: undefined }))}
    />}
    <AdvancedGlassEditor config={config} locale={locale} onChange={onChange} scope="island"
      base={material} hasGlass={hasGlass} />
  </>
}

export function PlaybackBackgroundSetting({ config, locale, onChange }: AppearanceProps) {
  const t = createTranslator(locale)
  if (!getInterfaceThemeDefinition(getInterfaceTheme(config)).playbackWave) return null
  return <Switch
    label={t('settings.playbackWave')}
    hint={t('settings.playbackWaveHint')}
    checked={getPlaybackWaveEnabled(config)}
    onChange={playbackWaveEnabled => onChange(withUiPrefs(config, { playbackWaveEnabled }))}
  />
}
