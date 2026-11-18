import { describe, expect, it } from 'vitest'
import type { AppConfig } from './types'
import {
  getInterfacePalette,
  getPlaybackWaveEnabled,
  getInterfacePaletteStyle,
  getInterfaceScene,
  getInterfaceTheme,
  getReducedTransparency,
  getSettingsColorScheme,
  getUsageWidgetCompact,
  getUsageWidgetScale,
  normalizeUsageWidgetScale,
  withUiPrefs,
} from './uiPrefs'

function configWithUi(ui?: unknown): AppConfig {
  return {
    plugins: { enabled: [], settings: ui === undefined ? {} : { ui } },
  } as unknown as AppConfig
}

describe('interface theme preferences', () => {
  it('defaults to Glass and keeps explicit Classic after native migration', () => {
    expect(getInterfaceTheme(configWithUi())).toBe('glass')
    expect(getInterfaceTheme(configWithUi({ interfaceTheme: 'future' }))).toBe('glass')
    expect(getInterfaceTheme(configWithUi({ interfaceTheme: 'constructor' }))).toBe('glass')
    expect(getInterfaceScene(configWithUi({ interfaceTheme: 'classic', interfaceScenes: { glass: 'fox' } }))).toBeUndefined()
    expect(getInterfaceScene(configWithUi({ interfaceTheme: 'glass' }))).toBe('fox')
    expect(getInterfaceScene(configWithUi({ interfaceTheme: 'glass', interfaceScenes: { glass: 'unknown' } }))).toBe('fox')
    expect(getInterfaceScene(configWithUi({ interfaceTheme: 'glass', interfaceScenes: { glass: 'manta' } }))).toBe('manta')
  })

  it('enables the wave in Glass by default and remembers the switch across themes', () => {
    const glass = configWithUi({ interfaceTheme: 'glass' })
    expect(getPlaybackWaveEnabled(glass)).toBe(true)
    expect(getPlaybackWaveEnabled(withUiPrefs(glass, { interfaceTheme: 'classic' }))).toBe(false)
    const disabled = withUiPrefs(glass, { playbackWaveEnabled: false })
    const classic = withUiPrefs(disabled, { interfaceTheme: 'classic' })
    expect(getPlaybackWaveEnabled(withUiPrefs(classic, { interfaceTheme: 'glass' }))).toBe(false)
  })

  it('remembers the selected Glass scene when switching back from Classic', () => {
    const glass = withUiPrefs(configWithUi({ settingsColorScheme: 'light' }), {
      interfaceTheme: 'glass', interfaceScenes: { glass: 'fox' }, reducedTransparency: true,
    })
    const classic = withUiPrefs(glass, { interfaceTheme: 'classic' })
    const restored = withUiPrefs(classic, { interfaceTheme: 'glass' })
    expect(getInterfaceScene(classic)).toBeUndefined()
    expect(getInterfaceScene(restored)).toBe('fox')
    expect(getReducedTransparency(restored)).toBe(true)
    expect(getSettingsColorScheme(restored)).toBe('light')
  })
})

describe('interface color palette', () => {
  it('falls back to the stored custom accent for older profiles and unknown presets', () => {
    const config = { ...configWithUi({ interfacePalette: 'removed-preset' }), appearance: { accentColor: '#ad5242' } } as AppConfig
    expect(getInterfacePalette(config)).toBe('custom')
    expect(getInterfacePaletteStyle(config, 'light')['--accent']).toBe('#ad5242')
    expect(getInterfacePaletteStyle(config, 'dark')['--palette-primary']).toBe('initial')
  })

  it('remembers the palette across materials and restores the custom accent when requested', () => {
    const base = { ...configWithUi(), appearance: { accentColor: '#ad5242' } } as AppConfig
    const config = withUiPrefs(base, { interfaceTheme: 'glass', interfacePalette: 'ocean' })
    expect(getInterfacePaletteStyle(config, 'dark')).toMatchObject({
      '--palette-primary': '#70b9ee',
      '--palette-secondary': '#5bd0d6',
    })
    const classic = withUiPrefs(config, { interfaceTheme: 'classic', settingsColorScheme: 'light' })
    expect(getInterfacePalette(classic)).toBe('ocean')
    expect(getInterfacePaletteStyle(classic, 'light')['--accent']).toBe('#2672af')
    const restored = withUiPrefs(classic, { interfacePalette: 'custom' })
    expect(getInterfacePaletteStyle(restored, 'light')['--accent']).toBe('#ad5242')
  })
})

describe('usage widget preferences', () => {
  it('keeps legacy and absent configuration at stable defaults', () => {
    expect(getUsageWidgetScale(undefined)).toBe(1)
    expect(getUsageWidgetScale(configWithUi())).toBe(1)
    expect(getUsageWidgetCompact(configWithUi({}))).toBe(true)
  })

  it('accepts finite scale values and clamps the persisted range', () => {
    expect(normalizeUsageWidgetScale(0.8)).toBe(0.8)
    expect(normalizeUsageWidgetScale(0.2)).toBe(0.65)
    expect(normalizeUsageWidgetScale(2)).toBe(1.35)
  })

  it('rejects non-numeric and non-finite scale values', () => {
    expect(normalizeUsageWidgetScale('0.8')).toBe(1)
    expect(normalizeUsageWidgetScale(Number.NaN)).toBe(1)
    expect(normalizeUsageWidgetScale(Number.POSITIVE_INFINITY)).toBe(1)
  })

  it('keeps compact mode unless the literal boolean false disables it', () => {
    expect(getUsageWidgetCompact(configWithUi({ usageWidgetCompact: true }))).toBe(true)
    expect(getUsageWidgetCompact(configWithUi({ usageWidgetCompact: false }))).toBe(false)
    expect(getUsageWidgetCompact(configWithUi({ usageWidgetCompact: 1 }))).toBe(true)
    expect(getUsageWidgetCompact(configWithUi({ usageWidgetCompact: 'false' }))).toBe(true)
  })

  it('round-trips preferences without replacing unrelated UI state', () => {
    const base = configWithUi({ developerMode: true })
    const saved = withUiPrefs(base, { usageWidgetScale: 1.2, usageWidgetCompact: true })
    expect(getUsageWidgetScale(saved)).toBe(1.2)
    expect(getUsageWidgetCompact(saved)).toBe(true)
    expect(saved.plugins.settings.ui).toMatchObject({ developerMode: true })
  })
})
