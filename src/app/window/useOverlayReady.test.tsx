/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOverlayReady } from './useOverlayReady'
import { resetWindowPosition, showOverlayReady } from '../tauriApi'
vi.mock('../tauriApi', () => ({ resetWindowPosition: vi.fn(async () => {}), showOverlayReady: vi.fn(async () => true) }))
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
function Ready({ enabled }: { enabled: boolean }) { useOverlayReady(enabled); return null }
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })
describe('first overlay presentation', () => {
  it('waits for config, places the hidden window, and retries a stale viewport', async () => {
    vi.useFakeTimers()
    const node = document.createElement('div'), root = createRoot(node)
    vi.mocked(showOverlayReady).mockResolvedValueOnce(false).mockResolvedValue(true)
    await act(async () => root.render(<Ready enabled={false} />))
    expect(resetWindowPosition).not.toHaveBeenCalled()
    await act(async () => root.render(<Ready enabled />))
    expect(resetWindowPosition).toHaveBeenCalledOnce()
    expect(showOverlayReady).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(60) })
    expect(showOverlayReady).toHaveBeenCalledOnce()
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(showOverlayReady).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(showOverlayReady).toHaveBeenCalledTimes(2)
    await act(async () => root.unmount())
  })
  it('does not show after an obsolete placement resolves following unmount', async () => {
    vi.useFakeTimers()
    let resolve!: () => void
    vi.mocked(resetWindowPosition).mockImplementationOnce(() => new Promise<void>(done => { resolve = done }))
    const root = createRoot(document.createElement('div'))
    await act(async () => root.render(<Ready enabled />))
    await act(async () => root.unmount())
    await act(async () => { resolve(); await vi.advanceTimersByTimeAsync(1000) })
    expect(showOverlayReady).not.toHaveBeenCalled()
  })
})
