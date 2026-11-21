import { expect, it } from 'vitest'
import { serializeAppearancePreset } from './appearancePreset'
import { normalizeIslandShader, shaderOverrides } from './shaderTuning'
import type { AppConfig } from './types'
import { withUiPrefs } from './uiPrefs'

const config = {
  taskbar: { enabled: true, scale: 1.15 },
  appearance: { theme: 'liquid-glass-dark', accentColor: '#fe9', opacity: .8, blurStrength: 16, cornerRadius: 12, reducedMotion: false, locale: 'ru' },
  layout: { size: 'medium', width: 92, scale: 100, density: 'balanced', preset: 'album-pill', showArtwork: true, showProgress: true },
  behavior: { monitorId: 'PRIVATE-MONITOR' },
  media: { preferredSourceAppId: 'PRIVATE-APP' },
  plugins: { enabled: [], settings: { voice: { apiKey: 'PRIVATE-KEY', lastText: 'PRIVATE-TEXT' } } },
} as unknown as AppConfig

it('exports one deterministic visual preset with active and inherited settings from both windows', () => {
  const styled = withUiPrefs(config, {
    developerMode: false, glassAdvancedEnabled: false,
    glassMaterial: { frost: 0 }, advancedGlass: { transport: { bend: 0, background: '#AB12CD' } },
    interfacePalette: 'ocean', playbackWaveEnabled: false, islandShader: { particleCount: 0, waveColor: '#abcdef' },
    dictationAppearance: { theme: 'wave', palette: 'white', chromatic: false, materialTheme: 'glass', shaderTuning: { speed: 0 } },
  })
  const json = serializeAppearancePreset(styled)
  expect(serializeAppearancePreset(JSON.parse(JSON.stringify(styled)))).toBe(json)
  expect(json).not.toMatch(/PRIVATE|apiKey|developerMode|lastText|monitorId/)
  const preset = JSON.parse(json)
  expect(preset).toMatchObject({
    format: 'music-island.appearance', version: 1,
    island: { palette: 'ocean', colors: { customAccent: '#ffee99' }, glass: { frost: 0 },
      shaders: { playbackWaveEnabled: false, overrides: { particleCount: 0 }, effective: { waveSpeed: 1, particleCount: 0 } } },
    surfaces: { overrides: { transport: { bend: 0, background: '#ab12cd' } },
      effective: { body: { frost: 0 }, transport: { bend: 0, background: '#ab12cd' }, progressFill: { endColor: 'auto' } } },
    dictation: { material: 'glass', effectiveGlass: { frost: 85 }, shaders: { overrides: { speed: 0 }, effective: { speed: 0, lightIntensity: 28 } } },
    taskbar: { enabled: true, scale: 1.15 },
  })
  expect(preset.surfaces.effective.body).not.toHaveProperty('rim')
  expect(preset.surfaces.effective.progressFill).not.toHaveProperty('textSize')
})

it('distinguishes automatic colors and inherited capsule glass from explicit settings', () => {
  const preset = JSON.parse(serializeAppearancePreset(withUiPrefs(config, { glassMaterial: { frost: 22 } })))
  expect(preset.dictation).toMatchObject({ material: 'follow-island', glassOverride: null, effectiveGlass: { frost: 22 } })
  expect(preset.island.shaders).toMatchObject({ overrides: {}, effective: { waveColor: null, particleColor: null } })
  const invalid = { waveIntensity: '#ffffff', particleCount: -90, waveColor: 22, particleColor: 'url(private)' }
  expect(shaderOverrides(invalid, normalizeIslandShader(invalid))).toEqual({ particleCount: 0 })
})
