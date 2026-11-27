// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { deferOverlayClose, OVERLAY_CLOSE_GRACE_MS, shouldDeferOverlayClose } from './overlayWindow'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

it('retains the opening grace and closes on one outside sample even when the cursor stops', () => {
  const close = vi.fn()
  expect(shouldDeferOverlayClose(60, 0)).toBe(true)
  deferOverlayClose(60, 0, 0, close)
  vi.advanceTimersByTime(OVERLAY_CLOSE_GRACE_MS - 61)
  expect(close).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(close).toHaveBeenCalledOnce()
})

it('allows re-entry to cancel an outside sample during an explicit reveal', () => {
  const close = vi.fn()
  const pending = deferOverlayClose(130, 100, 3100, close)
  expect(pending).not.toBeNull()
  window.clearTimeout(pending!)
  vi.advanceTimersByTime(3100)
  expect(close).not.toHaveBeenCalled()
  expect(deferOverlayClose(3100, 100, 3100, close)).toBeNull()
})
