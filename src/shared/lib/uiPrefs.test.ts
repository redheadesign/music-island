import { describe, expect, it } from 'vitest'
import type { AppConfig } from './types'
import { DEFAULT_GLASS_MATERIAL, getGlassMaterial, glassMaterialStyle } from './glassMaterial'
import {
  getInterfacePalette,
  getPlaybackWaveEnabled,
  getInterfacePaletteStyle,
  getInterfaceTheme,
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
  it('uses the current glass preset for missing settings and preserves explicit legacy values', () => {
    const preset = { transparency: 100, frost: 20, parallax: 100, highlight: 42, edge: 50 }
    expect(getGlassMaterial(null)).toEqual(preset)
    expect(getGlassMaterial(configWithUi({ glassMaterial: { transparency: 55, frost: 0 } })))
      .toEqual({ ...preset, transparency: 55, frost: 0 })
  })

  it('keeps each glass control across theme switches and accepts zero', () => {
    expect(getGlassMaterial(configWithUi())).toEqual(DEFAULT_GLASS_MATERIAL)
    const values = { transparency: 80, frost: 0, parallax: 0, edge: 23, highlight: 40 }
    const config = withUiPrefs(configWithUi(), { glassMaterial: values })
    const classic = withUiPrefs(config, { interfaceTheme: 'classic' })
    expect(getGlassMaterial(withUiPrefs(classic, { interfaceTheme: 'glass' }))).toEqual(values)
    expect(glassMaterialStyle(values)).toMatchObject({
      '--glass-user-filter': 'none', '--glass-frost-strength': 0, '--glass-parallax-strength': 0,
      '--glass-transparency-strength': .8, '--glass-edge-strength': .23, '--glass-highlight-strength': .4,
    })
  })

  it('repairs each invalid persisted setting without discarding the other values', () => {
    expect(getGlassMaterial(configWithUi({ glassMaterial: { frost: '80', transparency: 125, edge: -12, highlight: .6 } })))
      .toEqual({ ...DEFAULT_GLASS_MATERIAL, transparency: 100, edge: 0, highlight: 1 })
  })
  it('defaults to Glass and keeps explicit Classic after native migration', () => {
    expect(getInterfaceTheme(configWithUi())).toBe('glass')
    expect(getInterfaceTheme(configWithUi({ interfaceTheme: 'future' }))).toBe('glass')
    expect(getInterfaceTheme(configWithUi({ interfaceTheme: 'constructor' }))).toBe('glass')
  })

  it('enables the wave in Glass by default and remembers the switch across themes', () => {
    const glass = configWithUi({ interfaceTheme: 'glass' })
    expect(getPlaybackWaveEnabled(glass)).toBe(true)
    expect(getPlaybackWaveEnabled(withUiPrefs(glass, { interfaceTheme: 'classic' }))).toBe(false)
    const disabled = withUiPrefs(glass, { playbackWaveEnabled: false })
    const classic = withUiPrefs(disabled, { interfaceTheme: 'classic' })
    expect(getPlaybackWaveEnabled(withUiPrefs(classic, { interfaceTheme: 'glass' }))).toBe(false)
  })

})

describe('interface color palette', () => {
  it('falls back to the stored custom accent for older profiles and unknown presets', () => {
    const config = { ...configWithUi({ interfacePalette: 'removed-preset' }), appearance: { accentColor: '#ad5242' } } as AppConfig
    expect(getInterfacePalette(config)).toBe('custom')
    expect(getInterfacePaletteStyle(config)['--accent']).toBe('#ad5242')
    expect(getInterfacePaletteStyle(config)['--palette-primary']).toBe('initial')
  })

  it('remembers the palette across materials and restores the custom accent when requested', () => {
    const base = { ...configWithUi(), appearance: { accentColor: '#ad5242' } } as AppConfig
    const config = withUiPrefs(base, { interfaceTheme: 'glass', interfacePalette: 'ocean' })
    expect(getInterfacePaletteStyle(config)).toMatchObject({
      '--palette-primary': '#70b9ee',
      '--palette-secondary': '#5bd0d6',
    })
    const classic = withUiPrefs(config, { interfaceTheme: 'classic' })
    expect(getInterfacePalette(classic)).toBe('ocean')
    expect(getInterfacePaletteStyle(classic)['--accent']).toBe('#70b9ee')
    const restored = withUiPrefs(classic, { interfacePalette: 'custom' })
    expect(getInterfacePaletteStyle(restored)['--accent']).toBe('#ad5242')
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
