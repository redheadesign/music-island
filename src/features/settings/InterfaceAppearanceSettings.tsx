import { createTranslator } from '../../shared/i18n/messages'
import { getInterfaceThemeDefinition, INTERFACE_THEME_IDS, INTERFACE_THEMES } from '../../shared/lib/interfaceTheme'
import type { AppConfig, Locale } from '../../shared/lib/types'
import { getInterfaceTheme, getPlaybackWaveEnabled, withUiPrefs } from '../../shared/lib/uiPrefs'
import { AppearanceChoices } from './AppearanceChoices'
import { Switch } from '../../shared/ui/SettingsControls'

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
  return definition.playbackWave ? (
    <Switch
      label={t('settings.playbackWave')}
      hint={t('settings.playbackWaveHint')}
      checked={getPlaybackWaveEnabled(config)}
      onChange={playbackWaveEnabled => onChange(withUiPrefs(config, { playbackWaveEnabled }))}
    />
  ) : null
}
