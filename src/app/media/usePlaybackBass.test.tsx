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

it('suspends capture on system accessibility changes and ignores the old request', async () => {
  const systemQuiet = window.matchMedia('(forced-colors: active)')
  const matches = vi.spyOn(systemQuiet, 'matches', 'get').mockReturnValue(true)
  vi.spyOn(window, 'matchMedia').mockReturnValue(systemQuiet)
  await act(async () => root.render(<BassCapture enabled />))
  expect(api.setPlaybackBass).not.toHaveBeenCalled()
  expect(api.onPlaybackBass).not.toHaveBeenCalled()

  const setQuiet = async (enabled: boolean) => {
    matches.mockReturnValue(enabled)
    await act(async () => { systemQuiet.dispatchEvent(new Event('change')) })
  }
  await setQuiet(false)
  const first = vi.mocked(api.setPlaybackBass).mock.calls[0][0]
  sample({ request: first, bass: .13 })
  expect(apply).toHaveBeenLastCalledWith(.13)

  await setQuiet(true)
  expect(api.setPlaybackBass).toHaveBeenLastCalledWith(first, false)
  expect(apply).toHaveBeenLastCalledWith()
  await setQuiet(false)
  const second = vi.mocked(api.setPlaybackBass).mock.calls[2][0]
  expect(second).not.toBe(first)
  sample({ request: first, bass: .9 })
  expect(apply).not.toHaveBeenCalledWith(.9)
})

it('drops a pending subscription if the window hides before native events are attached', async () => {
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const release = vi.fn()
  let finish!: (remove: () => void) => void
  vi.mocked(api.onPlaybackBass).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await act(async () => root.render(<BassCapture enabled />))
  hidden.mockReturnValue(true)
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  await act(async () => { finish(release) })
  expect(release).toHaveBeenCalledTimes(1)
  expect(api.setPlaybackBass).not.toHaveBeenCalled()

  hidden.mockReturnValue(false)
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  expect(api.setPlaybackBass).toHaveBeenCalledTimes(1)
})
