// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { DictationStatus } from '../../shared/lib/dictationTypes'
import type { AppConfig } from '../../shared/lib/types'
import { useDictationOverlay } from './useDictationOverlay'
import { withUiPrefs } from '../../shared/lib/uiPrefs'

const mocks = vi.hoisted(() => ({ listeners: new Map<string, (event: { payload: unknown }) => void>(), disposers: [] as ReturnType<typeof vi.fn>[], readConfig: vi.fn(async () => ({ appearance: { locale: 'ru', reducedMotion: false, accentColor: '#f76100' } })), configChanged: null as null | ((config: AppConfig) => void), configDispose: vi.fn() }))
vi.mock('./dictationEvents', () => ({ listenDictationEvent: async (name: string, callback: (event: { payload: unknown }) => void) => {
  mocks.listeners.set(name, callback)
  const dispose = vi.fn(() => mocks.listeners.delete(name)); mocks.disposers.push(dispose)
  return dispose
} }))
vi.mock('./dictationApi', () => ({ dictationApi: { getStatus: async () => ({ revision: 0, operationId: 0, phase: 'idle', ready: false, text: '', error: null }), cancelOperation: vi.fn(), copyResult: vi.fn() } }))
vi.mock('../tauriApi', () => ({ getConfig: mocks.readConfig, onConfigChanged: async (callback: (config: AppConfig) => void) => { mocks.configChanged = callback; return mocks.configDispose } }))

it('keeps native visibility, revision and streaming operation ownership', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const root = createRoot(document.createElement('div'))
  let overlay!: ReturnType<typeof useDictationOverlay>
  function Probe() { overlay = useDictationOverlay(); return null }
  const emit = async (name: string, payload: unknown) => act(async () => mocks.listeners.get(name)?.({ payload }))
  const status: DictationStatus = { revision: 2, operationId: 10, phase: 'streaming', ready: true, text: '', error: null }
  try {
    await act(async () => root.render(<Probe />))
    expect(overlay.visible).toBe(false)
    await emit('show-overlay', 'streaming')
    await emit('dictation:status', status)
    await emit('stream-text-event', { operation_id: 10, committed: 'Слова ', tentative: 'здесь' })
    expect(overlay.text.committed).toBe('Слова ')
    await emit('dictation:status', { ...status, revision: 1, operationId: 9, phase: 'completed' })
    await emit('stream-text-event', { operation_id: 9, committed: 'Старая запись', tentative: '' })
    expect(overlay.status).toEqual(status)
    expect(overlay.text.committed).toBe('Слова ')
    await emit('dictation:status', { ...status, revision: 3, operationId: 11 })
    expect(overlay.text.committed).toBe('')
    await emit('hide-overlay', null)
    expect(overlay.visible).toBe(false)
  } finally { await act(async () => root.unmount()) }
  expect(mocks.disposers.every(dispose => dispose.mock.calls.length === 1)).toBe(true)
})

it('applies theme changes live and rejects an older config read that finishes after a change', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let finish!: (config: AppConfig) => void
  mocks.readConfig.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const root = createRoot(document.createElement('div'))
  let overlay!: ReturnType<typeof useDictationOverlay>
  function Probe() { overlay = useDictationOverlay(); return null }
  const config = (theme: string, character = 'eyes') => ({ appearance: { locale: 'en', reducedMotion: true, accentColor: '#548dec' }, plugins: { enabled: [], settings: { ui: { dictationAppearance: { theme, character } } } } }) as unknown as AppConfig
  try {
    await act(async () => root.render(<Probe />))
    await act(async () => mocks.configChanged?.(config('pixels', 'fox')))
    expect(overlay.appearance).toEqual({ theme: 'pixels', palette: 'accent', chromatic: false })
    expect(overlay.locale).toBe('en')
    await act(async () => finish(config('classic')))
    expect(overlay.appearance.theme).toBe('pixels')
    await act(async () => mocks.configChanged?.(config('wave')))
    expect(overlay.appearance.theme).toBe('wave')
    expect(overlay.reducedMotion).toBe(true)
  } finally { await act(async () => root.unmount()) }
  expect(mocks.configDispose).toHaveBeenCalledTimes(2)
})

it('updates capsule material and interface palette during a live recording without resetting its operation', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const root = createRoot(document.createElement('div'))
  let overlay!: ReturnType<typeof useDictationOverlay>
  function Probe() { overlay = useDictationOverlay(); return null }
  const config = {
    appearance: { locale: 'ru', reducedMotion: false, accentColor: '#548dec' },
    plugins: { enabled: [], settings: { ui: {
      interfaceTheme: 'classic', interfacePalette: 'ember',
      dictationAppearance: { theme: 'wave', palette: 'white', chromatic: true },
    } } },
  } as unknown as AppConfig
  const status: DictationStatus = { revision: 7, operationId: 9, phase: 'streaming', ready: true, text: '', error: null }
  const emit = async (name: string, payload: unknown) => act(async () => mocks.listeners.get(name)?.({ payload }))
  try {
    await act(async () => root.render(<Probe />))
    await act(async () => mocks.configChanged?.(config))
    await emit('show-overlay', 'streaming')
    await emit('dictation:status', status)
    await emit('mic-level', [.3, .5])
    await emit('stream-text-event', { operation_id: 9, committed: 'Слова ', tentative: 'сейчас' })
    const text = overlay.text
    const levels = overlay.levels
    await act(async () => mocks.configChanged?.(withUiPrefs(config, { interfaceTheme: 'glass', interfacePalette: 'ocean' })))
    expect(overlay.status).toBe(status)
    expect(overlay.visible).toBe(true)
    expect(overlay.text).toBe(text)
    expect(overlay.levels).toBe(levels)
    expect(overlay.interfaceTheme).toBe('glass')
    expect(overlay.interfacePalette).toBe('ocean')
    expect(overlay.paletteStyle['--accent']).toBe('#70b9ee')
    expect(overlay.appearance).toEqual({ theme: 'wave', palette: 'white', chromatic: true })
    await act(async () => mocks.configChanged?.({ ...config, appearance: { ...config.appearance, locale: 'en' } }))
    expect(overlay.interfaceTheme).toBe('classic')
    expect(overlay.locale).toBe('en')
    expect(overlay.status.operationId).toBe(9)
  } finally { await act(async () => root.unmount()) }
})
