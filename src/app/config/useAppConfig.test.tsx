// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import * as api from '../tauriApi'
import { useAppConfig } from './useAppConfig'
vi.mock('../tauriApi', async importOriginal => ({ ...await importOriginal<typeof api>(), getConfig: vi.fn(), onConfigChanged: vi.fn(), onAutostartSync: vi.fn().mockResolvedValue(() => {}) }))
it('protects an unreadable profile and retries the read before enabling writes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.mocked(api.onConfigChanged).mockResolvedValue(() => {})
  vi.mocked(api.getConfig).mockRejectedValueOnce(new Error('Cannot read')).mockResolvedValueOnce(api.getDefaultConfig())
  const root = createRoot(document.createElement('div'))
  let state!: ReturnType<typeof useAppConfig>
  function Probe() { state = useAppConfig(false); return null }
  try {
    await act(async () => root.render(<Probe />))
    expect(state.configLoadFailed).toBe(true)
    await expect(state.updateConfig(api.getDefaultConfig())).rejects.toThrow()
    await act(async () => state.retryConfigLoad())
    expect(state.configLoadFailed).toBe(false)
    expect(state.configLoaded).toBe(true)
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.clearAllMocks() }
})

it('keeps a change event newer than the pending initial read and disposes the listener', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const old = api.getDefaultConfig()
  const changed = { ...old, appearance: { ...old.appearance, accentColor: '#abcdef' } }
  let resolve!: (value: typeof old) => void
  vi.mocked(api.getConfig).mockReturnValue(new Promise(r => { resolve = r }))
  const dispose = vi.fn()
  vi.mocked(api.onConfigChanged).mockResolvedValue(dispose)
  let state!: ReturnType<typeof useAppConfig>
  function Probe() { state = useAppConfig(false); return null }
  const host = document.createElement('div'); const root = createRoot(host)
  try {
    await act(async () => root.render(<Probe />))
    await act(async () => vi.mocked(api.onConfigChanged).mock.calls[0][0](changed))
    await act(async () => resolve(old))
    expect(state.config.appearance.accentColor).toBe('#abcdef')
    expect(state.configLoaded).toBe(true)
    await act(async () => root.unmount())
    expect(dispose).toHaveBeenCalledOnce()
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.resetAllMocks() }
})
