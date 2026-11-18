import { createTranslator } from '../../shared/i18n/messages'
import { getInterfaceThemeDefinition, INTERFACE_THEME_IDS, INTERFACE_THEMES } from '../../shared/lib/interfaceTheme'
import type { AppConfig, Locale } from '../../shared/lib/types'
import { getInterfaceTheme, getPlaybackWaveEnabled, withUiPrefs } from '../../shared/lib/uiPrefs'
import { Select } from '../../shared/ui/Select'
import { SettingRow, Switch } from '../../shared/ui/SettingsControls'

type AppearanceProps = {
  config: AppConfig
  locale: Locale
  onChange: (config: AppConfig) => void
}

export function InterfaceThemePicker({ config, locale, onChange }: AppearanceProps) {
  const t = createTranslator(locale)
  const theme = getInterfaceTheme(config)
  const themeLabel = t('settings.interfaceTheme')
  return <SettingRow className="settings-material-picker" label={themeLabel}>
    <Select
      ariaLabel={themeLabel}
      value={theme}
      options={INTERFACE_THEME_IDS.map(value => ({ value, label: INTERFACE_THEMES[value].label[locale] }))}
      onChange={value => {
        const interfaceTheme = INTERFACE_THEME_IDS.find(id => id === value)
        if (interfaceTheme && interfaceTheme !== theme) onChange(withUiPrefs(config, { interfaceTheme }))
      }}
    />
  </SettingRow>
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
