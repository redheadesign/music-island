import { describe, expect, it } from 'vitest'
import {
  completeProgressTransition, initialProgressTransition, progressTrackKey, reconcileProgressTransition,
  type ProgressFrame, type ProgressNavigation,
} from './progressTransition'

const frame = (trackKey = 'a', ratio = .65, positionMs = 65_000): ProgressFrame => ({ trackKey, ratio, positionMs, durationMs: 100_000, label: trackKey })
const navigation = (direction: 'next' | 'previous', overrides: Partial<ProgressNavigation> = {}): ProgressNavigation => ({
  id: 1, direction, fromTrackKey: 'a', fromPositionMs: 65_000, requestedAt: 1_000, ...overrides,
})

describe('progress visual transition', () => {
  it('keeps old progress intact until its forward exit completes', () => {
    const state = reconcileProgressTransition(initialProgressTransition(frame()), frame('b', 0, 0), navigation('next'), false, 1_100)
    expect(state.phase).toBe('exiting')
    expect(state.direction).toBe('next')
    expect(state.visible).toEqual(frame())
    expect(completeProgressTransition(state).visible).toEqual(frame('b', 0, 0))
  })

  it('uses the opposite exit for previous, including a same-track restart', () => {
    const previous = reconcileProgressTransition(initialProgressTransition(frame()), frame('before', 0, 0), navigation('previous'), false, 1_100)
    const restart = reconcileProgressTransition(initialProgressTransition(frame()), frame('a', 0, 0), navigation('previous'), false, 1_100)
    expect(previous.direction).toBe('previous')
    expect(restart.phase).toBe('exiting')
    expect(restart.direction).toBe('previous')
    const completed = completeProgressTransition(restart)
    expect(reconcileProgressTransition(completed, frame('a', .01, 1_000), navigation('previous'), false, 1_200).phase).toBe('stable')
  })

  it('absorbs delayed provider identity after one previous restart animation', () => {
    const request = navigation('previous')
    const exiting = reconcileProgressTransition(
      initialProgressTransition(frame('a', .65, 65_000)),
      frame('a', 0, 0),
      request,
      false,
      1_100,
    )
    const completed = completeProgressTransition(exiting)
    const identified = reconcileProgressTransition(completed, frame('before', .02, 2_000), request, false, 1_700)

    expect(identified.phase).toBe('stable')
    expect(identified.visible.trackKey).toBe('before')
    expect(identified.generation).toBe(completed.generation)
    expect(identified.awaitingIdentityNavigation).toBeNull()
  })

  it('does not suppress a later automatic advance after the identity grace expires', () => {
    const request = navigation('previous')
    const restarted = reconcileProgressTransition(initialProgressTransition(frame()), frame('a', 0, 0), request, false, 1_100)
    const completed = completeProgressTransition(restarted)
    const automatic = reconcileProgressTransition(completed, frame('b', 0, 0), request, false, 3_600)

    expect(automatic.phase).toBe('exiting')
    expect(automatic.direction).toBe('next')
  })

  it('ends identity coalescing when the destination arrives during the exit', () => {
    const request = navigation('previous')
    let state = reconcileProgressTransition(initialProgressTransition(frame()), frame('a', 0, 0), request, false, 1_100)
    state = reconcileProgressTransition(state, frame('before', 0, 0), request, false, 1_200)
    const completed = completeProgressTransition(state)

    expect(completed.visible.trackKey).toBe('before')
    expect(completed.awaitingIdentityNavigation).toBeNull()
    expect(reconcileProgressTransition(completed, frame('automatic', 0, 0), request, false, 1_700).phase).toBe('exiting')
  })

  it('lets a repeated navigation command start its own transition', () => {
    const first = navigation('previous')
    const restarted = reconcileProgressTransition(initialProgressTransition(frame()), frame('a', 0, 0), first, false, 1_100)
    const identified = reconcileProgressTransition(completeProgressTransition(restarted), frame('b', 0, 0), first, false, 1_700)
    const repeated = navigation('next', { id: 2, fromTrackKey: 'b', fromPositionMs: 0, requestedAt: 1_800 })
    const next = reconcileProgressTransition(identified, frame('c', 0, 0), repeated, false, 1_900)

    expect(next.phase).toBe('exiting')
    expect(next.direction).toBe('next')
    expect(next.consumedNavigation).toBe(2)
  })

  it('keeps fallback track identity stable when duration metadata arrives late', () => {
    const base = { provider: 'smtc' as const, sourceAppId: 'player', trackId: null, title: 'Song' }
    expect(progressTrackKey({ ...base, durationMs: null })).toBe(progressTrackKey({ ...base, durationMs: 180_000 }))
  })

  it('does not treat an ordinary same-track seek as navigation', () => {
    const state = reconcileProgressTransition(initialProgressTransition(frame()), frame('a', .05, 5_000), null, false)
    expect(state.phase).toBe('stable')
    expect(state.visible.ratio).toBe(.05)
  })

  it('does not animate on a command until the provider confirms a change', () => {
    const state = reconcileProgressTransition(initialProgressTransition(frame()), frame(), navigation('next'), false, 1_100)
    expect(state.phase).toBe('stable')
    expect(state.visible.ratio).toBe(.65)
  })

  it('keeps the latest destination during rapid updates and preserves outgoing direction', () => {
    const exiting = reconcileProgressTransition(initialProgressTransition(frame()), frame('b', 0, 0), navigation('next'), false, 1_100)
    const latest = reconcileProgressTransition(exiting, frame('c', .07, 7_000), navigation('previous', { id: 2 }), false, 1_150)
    expect(latest.visible).toEqual(frame())
    expect(latest.direction).toBe('next')
    expect(completeProgressTransition(latest).visible).toEqual(frame('c', .07, 7_000))
  })

  it('reveals the latest authoritative fraction after rapid next/previous navigation', () => {
    const firstNavigation = navigation('next')
    let state = reconcileProgressTransition(
      initialProgressTransition(frame('a', .65, 65_000)),
      frame('b', .04, 4_000),
      firstNavigation,
      false,
      1_100,
    )

    state = reconcileProgressTransition(
      state,
      frame('a', .12, 12_000),
      navigation('previous', {
        id: 2,
        fromTrackKey: 'b',
        fromPositionMs: 4_000,
        requestedAt: 1_140,
      }),
      false,
      1_160,
    )

    expect(state.phase).toBe('exiting')
    expect(state.visible.ratio).toBe(.65)
    expect(state.pending?.ratio).toBe(.12)
    expect(completeProgressTransition(state).visible).toEqual(frame('a', .12, 12_000))
  })

  it('does not start a new exit generation as the pending timeline continues updating', () => {
    let state = reconcileProgressTransition(initialProgressTransition(frame()), frame('b', 0, 0), navigation('next'), false, 1_100)
    const exitGeneration = state.generation
    for (let position = 1; position <= 20; position += 1) {
      state = reconcileProgressTransition(state, frame('b', position / 100, position * 1_000), navigation('next'), false, 1_100 + position)
      expect(state.generation).toBe(exitGeneration)
      expect(state.visible.trackKey).toBe('a')
    }
    expect(completeProgressTransition(state).visible.positionMs).toBe(20_000)
  })

  it('defaults unknown or stale navigation to forward', () => {
    const next = frame('b', 0, 0)
    expect(reconcileProgressTransition(initialProgressTransition(frame()), next, null, false).direction).toBe('next')
    expect(reconcileProgressTransition(initialProgressTransition(frame()), next, navigation('previous'), false, 4_000).direction).toBe('next')
  })

  it('reveals the current provider position immediately for reduced motion or scrubbing', () => {
    const exiting = reconcileProgressTransition(initialProgressTransition(frame()), frame('b', 0, 0), null, false)
    const state = reconcileProgressTransition(exiting, frame('b', .42, 42_000), null, true)
    expect(state.phase).toBe('stable')
    expect(state.visible.ratio).toBe(.42)
    expect(state.pending).toBeNull()
  })

  it('lets a seek interrupt an active navigation transition at the scrubbed fraction', () => {
    const exiting = reconcileProgressTransition(
      initialProgressTransition(frame('a', .65, 65_000)),
      frame('b', .03, 3_000),
      navigation('next'),
      false,
      1_100,
    )
    const scrubbed = reconcileProgressTransition(
      exiting,
      frame('b', .72, 72_000),
      navigation('next'),
      true,
      1_120,
    )

    expect(scrubbed.phase).toBe('stable')
    expect(scrubbed.visible).toEqual(frame('b', .72, 72_000))
    expect(scrubbed.pending).toBeNull()
  })
})
