import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { setOverlayBounds } from '../../app/tauriApi'
import { cancelOverlayWindowOperations, getOverlayBounds, syncOverlayWindow } from './overlayWindow'

vi.mock('../../app/tauriApi', () => ({ setOverlayBounds: vi.fn() }))
const bounds = getOverlayBounds(100, 100)

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', { setTimeout, devicePixelRatio: 1.5 })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.resetAllMocks()
})

it('publishes the expanded physical hit band immediately and rejects a late native acknowledgement after cancellation', async () => {
  let acknowledge!: () => void
  vi.mocked(setOverlayBounds).mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve }))
  const opening = syncOverlayWindow('opening', bounds)
  expect(setOverlayBounds).toHaveBeenCalledWith(true, 918, 450)
  cancelOverlayWindowOperations()
  acknowledge()
  expect(await opening).toBe(false)
})

it('keeps an older opening from overriding a newer collapse', async () => {
  const opening = syncOverlayWindow('opening', bounds)
  const collapsed = syncOverlayWindow('collapsed', bounds)
  await vi.runAllTimersAsync()
  expect(await collapsed).toBe(true)
  expect(await opening).toBe(false)
  expect(setOverlayBounds).toHaveBeenLastCalledWith(false, 330, 30)
})

it('makes the card available as soon as native input is ready, without advancing a timer', async () => {
  expect(await syncOverlayWindow('opening', bounds)).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})
