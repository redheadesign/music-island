import { afterEach, describe, expect, it, vi } from 'vitest'
import { PROGRESS_ENTER_DURATION_MS, PROGRESS_EXIT_DURATION_MS, watchProgressExit } from './progressExit'
import { completeProgressTransition, initialProgressTransition, reconcileProgressTransition } from './progressTransition'
import type { ProgressFrame } from './progressTransition'

const frame = (trackKey: string, positionMs = 0): ProgressFrame => ({
  trackKey, ratio: positionMs / 100_000, positionMs, durationMs: 100_000, label: trackKey,
})

afterEach(() => vi.useRealTimers())

describe('progress exit completion', () => {
  it('slows both navigation animation phases by the requested factor', () => {
    expect(PROGRESS_EXIT_DURATION_MS).toBe(240 * 1.5)
    expect(PROGRESS_ENTER_DURATION_MS).toBe(120 * 1.5)
  })

  it('finishes the latest pending frame when CSS never delivers animationend', () => {
    vi.useFakeTimers()
    const element = new EventTarget()
    let state = reconcileProgressTransition(initialProgressTransition(frame('a', 50_000)), frame('b'), null, false)
    const stop = watchProgressExit(element, () => { state = completeProgressTransition(state) })
    vi.advanceTimersByTime(PROGRESS_EXIT_DURATION_MS)
    expect(state.phase).toBe('exiting')
    state = reconcileProgressTransition(state, frame('c', 7_000), null, false)
    vi.advanceTimersByTime(50)
    expect(state.phase).toBe('stable')
    expect(state.visible).toEqual(frame('c', 7_000))
    stop()
  })

  it('settles a cancelled CSS animation once, without waiting for the fallback', () => {
    vi.useFakeTimers()
    const element = new EventTarget()
    const complete = vi.fn()
    const stop = watchProgressExit(element, complete)
    element.dispatchEvent(new Event('animationcancel'))
    expect(complete).toHaveBeenCalledTimes(1)
    vi.runAllTimers()
    element.dispatchEvent(new Event('animationcancel'))
    expect(complete).toHaveBeenCalledTimes(1)
    stop()
  })

  it('removes the old deadline and cancel listener when animationend or unmount cleans up', () => {
    vi.useFakeTimers()
    const element = new EventTarget()
    const complete = vi.fn()
    const stop = watchProgressExit(element, complete)
    stop()
    element.dispatchEvent(new Event('animationcancel'))
    vi.runAllTimers()
    expect(complete).not.toHaveBeenCalled()
  })
})
