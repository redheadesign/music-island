import type { OverlayWindowPhase } from './overlayWindow'

export interface OverlayTransition { phase: OverlayWindowPhase; generation: number }

/** Async completions only belong to the transition that started them. */
export function transitionOverlay(state: OverlayTransition, phase: OverlayWindowPhase, expected = state.generation): OverlayTransition {
  if (expected !== state.generation || phase === state.phase) return state
  return { phase, generation: state.generation + 1 }
}
