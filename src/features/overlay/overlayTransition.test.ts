import { describe, expect, it } from 'vitest'
import { transitionOverlay, type OverlayTransition } from './overlayTransition'

describe('overlay transition races', () => {
  it('ignores an old close completion after reopening', () => {
    let state: OverlayTransition = { phase: 'open', generation: 0 }
    state = transitionOverlay(state, 'closing')
    const closing = state.generation
    state = transitionOverlay(state, 'open')
    expect(transitionOverlay(state, 'collapsed', closing)).toBe(state)
  })
  it('cannot resurrect an aborted opening across 200 fast gestures', () => {
    let state: OverlayTransition = { phase: 'collapsed', generation: 0 }
    for (let i = 0; i < 200; i++) {
      state = transitionOverlay(state, 'opening')
      const opening = state.generation
      state = transitionOverlay(state, 'collapsed')
      expect(transitionOverlay(state, 'open', opening)).toBe(state)
      expect(state.phase).toBe('collapsed')
    }
  })
})
