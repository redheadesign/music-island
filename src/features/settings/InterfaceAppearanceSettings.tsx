import { createTranslator } from '../../shared/i18n/messages'
import { getGlassMaterial, normalizeGlassMaterial } from '../../shared/lib/glassMaterial'
import defaultAppearance from '../../shared/lib/defaultAppearance.json'
import { GLASS_NUMERIC_RANGES, normalizeAdvancedGlass } from '../../shared/lib/advancedGlass'
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
  const prefs = getUiPrefs(config)
  const body = normalizeAdvancedGlass(prefs.advancedGlass).body
  const bodyFrost = body?.frost
  const hasBodyFrost = bodyFrost !== undefined
  const maxFrost = GLASS_NUMERIC_RANGES.frost.max
  const stockFrost = defaultAppearance.ui.advancedGlass.body.frost
  const frostPercent = (pixels: number) => Math.round(pixels * 100 / maxFrost)
  const visibleMaterial = hasBodyFrost ? { ...material, frost: frostPercent(bodyFrost) } : material
  const stockMaterial = normalizeGlassMaterial(defaultAppearance.ui.glassMaterial)
  const resetMaterial = hasBodyFrost ? { ...stockMaterial, frost: frostPercent(stockFrost) } : undefined
  const bodyWithFrost = (frost: number) => ({ ...prefs.advancedGlass, body: { ...body, frost } })
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
      material={visibleMaterial}
      defaults={resetMaterial}
      onChange={(next, key) => onChange(withUiPrefs(config, {
        glassMaterial: key === 'frost' ? next : { ...next, frost: material.frost },
        ...(key === 'frost' && hasBodyFrost && { advancedGlass: bodyWithFrost(next.frost * maxFrost / 100) }),
      }))}
      onReset={() => onChange(withUiPrefs(config, hasBodyFrost
        ? { glassMaterial: stockMaterial, advancedGlass: bodyWithFrost(stockFrost) }
        : { glassMaterial: undefined }))}
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
