import { describe, expect, it } from 'vitest'
import type { AppConfig } from '../../shared/lib/types'
import { applyLayoutPreset } from './settingsPresets'

const baseConfig: AppConfig = {
  schemaVersion: 1,
  appearance: {
    theme: 'liquid-glass-dark',
    accentColor: '#8fb8ff',
    opacity: 0.92,
    blurStrength: 28,
    cornerRadius: 30,
    reducedMotion: false,
  },
  layout: {
    size: 'medium',
    scale: 100,
    density: 'balanced',
    showArtwork: true,
    showTitle: true,
    showArtist: true,
    showProgress: true,
    showSource: true,
    showPreviousNext: true,
    preset: 'album-pill',
  },
  behavior: {
    hoverDelayMs: 320,
    autoCollapseMs: 900,
    pinExpanded: false,
    alwaysOnTop: true,
    launchAtStartup: false,
    hideOverFullscreen: true,
    monitorId: null,
  },
  modules: {
    activeModule: 'music',
    enabledModules: ['music'],
  },
  privacy: {
    telemetryEnabled: false,
    writeDetailedLogs: false,
  },
}

describe('applyLayoutPreset', () => {
  it('keeps unrelated config sections unchanged', () => {
    const nextConfig = applyLayoutPreset(baseConfig, 'focus-mode')

    expect(nextConfig.appearance).toBe(baseConfig.appearance)
    expect(nextConfig.behavior).toBe(baseConfig.behavior)
    expect(nextConfig.modules).toBe(baseConfig.modules)
  })

  it('applies the clean controls preset', () => {
    const nextConfig = applyLayoutPreset(baseConfig, 'clean-controls')

    expect(nextConfig.layout.preset).toBe('clean-controls')
    expect(nextConfig.layout.density).toBe('buttons-only')
    expect(nextConfig.layout.showArtwork).toBe(false)
    expect(nextConfig.layout.showPreviousNext).toBe(true)
  })

  it('applies the focus mode preset', () => {
    const nextConfig = applyLayoutPreset(baseConfig, 'focus-mode')

    expect(nextConfig.layout.density).toBe('minimal')
    expect(nextConfig.layout.showTitle).toBe(true)
    expect(nextConfig.layout.showArtist).toBe(false)
    expect(nextConfig.layout.showProgress).toBe(true)
  })
})
