// @vitest-environment happy-dom
import { StrictMode, act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import * as api from '../tauriApi'
import { useAppConfig } from './useAppConfig'

vi.mock('../tauriApi', async (original) => ({
  ...await original<typeof import('../tauriApi')>(),
  getConfig: vi.fn(),
  onConfigChanged: vi.fn(),
  onAutostartSync: vi.fn(),
}))

describe('config subscription lifecycle', () => {
  it('releases delayed config and autostart listeners after StrictMode cleanup and unmount', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.mocked(api.getConfig).mockResolvedValue(api.getDefaultConfig())
    const pending: Array<{ resolve: (cleanup: () => void) => void; cleanup: () => void }> = []
    const deferred = () => new Promise<() => void>((resolve) => pending.push({ resolve, cleanup: vi.fn<() => void>() }))
    vi.mocked(api.onConfigChanged).mockImplementation(deferred)
    vi.mocked(api.onAutostartSync).mockImplementation(deferred)
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    function Probe() {
      useAppConfig(false)
      return null
    }
    try {
      await act(async () => root.render(<StrictMode><Probe /></StrictMode>))
      expect(pending).toHaveLength(4)
      await act(async () => root.unmount())
      await act(async () => {
        for (const listener of pending) listener.resolve(listener.cleanup)
      })
      for (const listener of pending) expect(listener.cleanup).toHaveBeenCalledOnce()
    } finally {
      await act(async () => root.unmount())
      container.remove()
      vi.unstubAllGlobals()
    }
  })
})
