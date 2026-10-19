import { expect, it } from 'vitest'
import { defaultDictationAppearance, getDictationAppearance, normalizeDictationAppearance } from './dictationAppearance'
import type { AppConfig } from './types'
import { withUiPrefs } from './uiPrefs'

it('defaults to Fox, preserves explicit saved themes and salvages malformed preferences', () => {
  expect(normalizeDictationAppearance(undefined)).toEqual(defaultDictationAppearance)
  expect(defaultDictationAppearance.theme).toBe('pixels')
  expect(normalizeDictationAppearance({ theme: 'classic' }).theme).toBe('classic')
  expect(normalizeDictationAppearance({ theme: 'unknown', character: 'cat', brightness: NaN })).toEqual(defaultDictationAppearance)
  expect(normalizeDictationAppearance({ theme: 'wave', palette: 'siri' })).toEqual({ theme: 'wave', palette: 'accent', chromatic: false })
  expect(normalizeDictationAppearance({ theme: 'pixels', palette: 'white' })).toEqual({ theme: 'pixels', palette: 'white', chromatic: false })
  expect(normalizeDictationAppearance({ theme: 'pixels', character: 'eyes', emotion: 'love', processing: 'snake', brightness: 999, waveBrightness: 0, lightIntensity: 900, showVisualization: false })).toEqual({ theme: 'pixels', palette: 'accent', chromatic: false })
})

it('preserves per-theme choices when switching away and back in the persisted app config', () => {
  const saved = { ...defaultDictationAppearance, theme: 'pixels' as const, palette: 'ember' as const }
  const base = { plugins: { enabled: [], settings: {} } } as unknown as AppConfig
  let config = withUiPrefs(base, { dictationAppearance: saved, developerMode: true })
  config = withUiPrefs(config, { dictationAppearance: { ...getDictationAppearance(config), theme: 'wave' } })
  config = withUiPrefs(config, { dictationAppearance: { ...getDictationAppearance(config), theme: 'pixels' } })
  expect(getDictationAppearance(JSON.parse(JSON.stringify(config)))).toEqual(saved)
  expect(config.plugins.settings.ui).toMatchObject({ developerMode: true })
})
