// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SystemVolumeSnapshot } from '../../shared/lib/systemVolume'
import { controlSystemVolume } from '../tauriApi'
import { useSystemVolume } from './useSystemVolume'

vi.mock('../tauriApi', () => ({ controlSystemVolume: vi.fn() }))
const command = vi.mocked(controlSystemVolume)
const speakers = { endpointId: 'speakers', volume: 48, muted: false }
const headphones = { endpointId: 'phones', volume: 22, muted: true }
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
let current: ReturnType<typeof useSystemVolume>
let root: ReturnType<typeof createRoot>

function Probe({ enabled = true }: { enabled?: boolean }) {
  current = useSystemVolume(enabled)
  return null
}

beforeEach(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  command.mockReset().mockResolvedValue(speakers)
  root = createRoot(document.createElement('div'))
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.restoreAllMocks()
  vi.useRealTimers()
  delete environment.IS_REACT_ACT_ENVIRONMENT
})

it('reads external changes and recovers from a disconnected output without issuing a write', async () => {
  await act(async () => root.render(<Probe />))
  expect(current).toMatchObject({ available: true, volume: 48, muted: false })
  command.mockRejectedValueOnce(new Error('Output unavailable')).mockResolvedValue(headphones)
  await act(async () => vi.advanceTimersByTimeAsync(1000))
  expect(current.available).toBe(false)
  await act(async () => vi.advanceTimersByTimeAsync(1000))
  expect(current).toMatchObject({ available: true, volume: 22, muted: true })
  expect(command.mock.calls.map(([a]) => a.kind)).toEqual(['read', 'read', 'read'])
})

it('preserves the stored level when toggling mute and coalesces samples without reordering clicks', async () => {
  await act(async () => root.render(<Probe />))
  let finish!: (value: SystemVolumeSnapshot) => void
  command.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  act(() => { current.toggleMute(); current.setVolume(24); current.setVolume(65); current.toggleMute() })
  expect(current).toMatchObject({ volume: 65, muted: false })
  expect(command.mock.calls[1][0]).toEqual({ kind: 'toggleMute', endpointId: 'speakers' })
  await act(async () => finish({ ...speakers, muted: true }))
  expect(command.mock.calls.slice(2)).toEqual([
    [{ kind: 'setVolume', endpointId: 'speakers', volume: 65 }],
    [{ kind: 'toggleMute', endpointId: 'speakers' }],
  ])
})

it('drops queued writes targeting the replaced device', async () => {
  await act(async () => root.render(<Probe />))
  let finish!: (value: SystemVolumeSnapshot) => void
  command.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  await act(async () => vi.advanceTimersByTimeAsync(1000))
  act(() => current.setVolume(90))
  await act(async () => finish(headphones))
  expect(current).toMatchObject({ volume: 22, muted: true })
  expect(command).toHaveBeenCalledTimes(2)
})

it('ignores the old pointer gesture even after the control has rendered the replacement output', async () => {
  await act(async () => root.render(<Probe />))
  const oldControls = current
  command.mockResolvedValue(headphones)
  await act(async () => vi.advanceTimersByTimeAsync(1000))
  expect(current.endpointId).toBe('phones')
  act(() => { oldControls.setVolume(98); oldControls.toggleMute() })
  expect(command).toHaveBeenCalledTimes(2)
  await act(async () => current.setVolume(35))
  expect(command).toHaveBeenLastCalledWith({ kind: 'setVolume', endpointId: 'phones', volume: 35 })
})

it('finishes the previous drag before accepting a new gesture after reopening the island', async () => {
  await act(async () => root.render(<Probe />))
  let finish!: (value: SystemVolumeSnapshot) => void
  command.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    .mockImplementation(async action => ({ ...speakers, volume: action.kind === 'setVolume' ? action.volume : speakers.volume }))
  act(() => { current.setVolume(20); current.setVolume(30) })
  await act(async () => root.render(null))
  await act(async () => root.render(<Probe />))
  expect(current.available).toBe(false)
  expect(command).toHaveBeenCalledTimes(2)
  await act(async () => finish({ ...speakers, volume: 20 }))
  expect(current.volume).toBe(30)
  await act(async () => current.setVolume(75))
  expect(command.mock.calls.slice(1).map(([action]) => action.kind === 'setVolume' && action.volume))
    .toEqual([20, 30, 75])
  expect(current.volume).toBe(75)
})

it('stops polling when disabled or hidden and reads immediately on return', async () => {
  await act(async () => root.render(<Probe enabled={false} />))
  expect(command).not.toHaveBeenCalled()
  await act(async () => root.render(<Probe />))
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
  await act(async () => vi.advanceTimersByTimeAsync(5000))
  expect(command).toHaveBeenCalledTimes(1)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  expect(command).toHaveBeenCalledTimes(2)
  await act(async () => root.render(<Probe enabled={false} />))
  await act(async () => vi.advanceTimersByTimeAsync(5000))
  expect(command).toHaveBeenCalledTimes(2)
  expect(current.available).toBe(false)
})
