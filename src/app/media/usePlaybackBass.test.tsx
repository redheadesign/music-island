// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as api from '../tauriApi'
import { usePlaybackBass } from './usePlaybackBass'

vi.mock('../tauriApi', () => ({
  onPlaybackBass: vi.fn(),
  setPlaybackBass: vi.fn(),
}))

const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const surface = document.createElement('div')
let root: ReturnType<typeof createRoot>
let sample: Parameters<typeof api.onPlaybackBass>[0]
const apply = vi.fn()

function BassCapture({ enabled }: { enabled: boolean }) {
  usePlaybackBass(enabled, apply)
  return null
}

beforeEach(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.clearAllMocks()
  vi.mocked(api.onPlaybackBass).mockImplementation(async (handler) => {
    sample = handler
    return () => {}
  })
  vi.mocked(api.setPlaybackBass).mockResolvedValue(true)
  root = createRoot(surface)
})

afterEach(async () => {
  await act(async () => root.unmount())
  vi.restoreAllMocks()
  vi.useRealTimers()
  delete environment.IS_REACT_ACT_ENVIRONMENT
})

it('retries an accepted start once if WASAPI never delivers a sample', async () => {
  await act(async () => root.render(<BassCapture enabled />))
  const first = vi.mocked(api.setPlaybackBass).mock.calls[0][0]
  await act(async () => vi.advanceTimersByTimeAsync(4499))
  expect(api.setPlaybackBass).toHaveBeenCalledTimes(1)
  await act(async () => vi.advanceTimersByTimeAsync(1))

  const second = vi.mocked(api.setPlaybackBass).mock.calls[2][0]
  expect(second).not.toBe(first)
  expect(api.setPlaybackBass).toHaveBeenNthCalledWith(2, first, false)
  expect(api.setPlaybackBass).toHaveBeenNthCalledWith(3, second, true)
  sample({ request: first, bass: .7 })
  sample({ request: second, bass: .13 })
  expect(apply).not.toHaveBeenCalledWith(.7)
  expect(apply).toHaveBeenCalledWith(.13)

  await act(async () => vi.advanceTimersByTimeAsync(5000))
  expect(api.setPlaybackBass).toHaveBeenCalledTimes(3)
  expect(apply).toHaveBeenLastCalledWith()
})

it('cancels the pending first-sample retry when the island closes', async () => {
  await act(async () => root.render(<BassCapture enabled />))
  const first = vi.mocked(api.setPlaybackBass).mock.calls[0][0]
  await act(async () => root.render(<BassCapture enabled={false} />))
  await act(async () => vi.advanceTimersByTimeAsync(5000))
  expect(api.setPlaybackBass).toHaveBeenCalledTimes(2)
  expect(api.setPlaybackBass).toHaveBeenLastCalledWith(first, false)
})
