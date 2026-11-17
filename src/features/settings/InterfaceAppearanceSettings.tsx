import { createTranslator } from '../../shared/i18n/messages'
import { getInterfaceThemeDefinition, INTERFACE_THEME_IDS, INTERFACE_THEMES } from '../../shared/lib/interfaceTheme'
import type { AppConfig, Locale } from '../../shared/lib/types'
import { getInterfaceScene, getInterfaceTheme, getPlaybackVisual, getReducedTransparency, getUiPrefs, withUiPrefs } from '../../shared/lib/uiPrefs'
import { Select } from '../../shared/ui/Select'
import { Button, SettingRow, Switch, Toggle } from '../../shared/ui/SettingsControls'

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

export function InterfaceAppearanceSettings({ config, locale, onChange, onOpenSource }: AppearanceProps & { onOpenSource: () => void }) {
  const t = createTranslator(locale)
  const theme = getInterfaceTheme(config)
  const definition = getInterfaceThemeDefinition(theme)
  const scene = getInterfaceScene(config)
  const sceneOptions = definition.scene?.options
  const playback = definition.playback
  const sceneLabel = t('settings.interfaceScene')
  const visualLabel = t('settings.playbackVisual')

  return <>
    {scene && sceneOptions ? (
      <SettingRow label={sceneLabel}>
        <Select
          ariaLabel={sceneLabel}
          value={scene}
          options={sceneOptions.map(value => ({ value, label: t(`settings.interfaceScene.${value}`) }))}
          onChange={value => {
            const selected = sceneOptions.find(id => id === value)
            if (selected && selected !== scene) onChange(withUiPrefs(config, {
              interfaceScenes: { ...getUiPrefs(config).interfaceScenes, [theme]: selected },
            }))
          }}
        />
      </SettingRow>
    ) : null}
    {playback ? <>
      <SettingRow label={visualLabel}>
        <Select
          ariaLabel={visualLabel}
          value={getPlaybackVisual(config) ?? playback.fallback}
          options={playback.options.map(value => ({ value, label: t(`settings.playbackVisual.${value}`) }))}
          onChange={value => {
            const playbackVisual = playback.options.find(visual => visual === value)
            if (playbackVisual) onChange(withUiPrefs(config, { playbackVisual }))
          }}
        />
      </SettingRow>
      <SettingRow label={t('settings.playbackReactiveWave')} hint={t('settings.playbackReactiveWaveHint')}>
        {config.media.protocol !== 'yandex-direct' ? (
          <Button size="compact" onClick={onOpenSource}>{t('settings.configureMusicSource')}</Button>
        ) : null}
        <Toggle
          checked={getUiPrefs(config).playbackReactiveWave === true}
          disabled={config.media.protocol !== 'yandex-direct'}
          onChange={playbackReactiveWave => onChange(withUiPrefs(config, { playbackReactiveWave }))}
        />
      </SettingRow>
    </> : null}
    {definition.material === 'glass' ? (
      <Switch
        label={t('settings.reducedTransparency')}
        checked={getReducedTransparency(config)}
        onChange={reducedTransparency => onChange(withUiPrefs(config, { reducedTransparency }))}
      />
    ) : null}
  </>
}
