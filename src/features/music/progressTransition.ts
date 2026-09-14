import type { MediaSnapshot } from '../../shared/lib/types'

export interface ProgressFrame {
  trackKey: string
  ratio: number
  positionMs: number | null
  durationMs: number | null
  label: string
}

export interface ProgressNavigation {
  id: number
  direction: 'next' | 'previous'
  fromTrackKey: string
  fromPositionMs: number | null
  requestedAt: number
}

export interface ProgressTransition {
  visible: ProgressFrame
  pending: ProgressFrame | null
  phase: 'stable' | 'exiting'
  direction: 'next' | 'previous'
  consumedNavigation: number | null
  awaitingIdentityNavigation: number | null
  generation: number
}

/** UI identity only; provider/session arbitration remains in the app controller. */
export function progressTrackKey(media: Pick<MediaSnapshot, 'provider' | 'sourceAppId' | 'trackId' | 'title' | 'durationMs'>): string {
  // Duration commonly arrives after title and is timeline metadata, not identity.
  // Including it made one provider track look like two successive tracks.
  return JSON.stringify([media.provider, media.sourceAppId, media.trackId || media.title])
}

export function initialProgressTransition(frame: ProgressFrame): ProgressTransition {
  return {
    visible: frame,
    pending: null,
    phase: 'stable',
    direction: 'next',
    consumedNavigation: null,
    awaitingIdentityNavigation: null,
    generation: 0,
  }
}

export function reconcileProgressTransition(
  state: ProgressTransition,
  frame: ProgressFrame,
  navigation: ProgressNavigation | null,
  skipMotion: boolean,
  now = Date.now(),
): ProgressTransition {
  if (skipMotion) {
    return {
      ...state,
      visible: frame,
      pending: null,
      phase: 'stable',
      consumedNavigation: navigation?.id ?? state.consumedNavigation,
      awaitingIdentityNavigation: null,
    }
  }
  if (state.phase === 'exiting') {
    // Rapid changes coalesce into the latest frame without redirecting the outgoing one.
    return { ...state, pending: frame, consumedNavigation: navigation?.id ?? state.consumedNavigation }
  }
  const freshNavigation = navigation
    && navigation.id !== state.consumedNavigation
    && navigation.fromTrackKey === state.visible.trackKey
    && now - navigation.requestedAt <= 2_500
      ? navigation : null
  const restartedPrevious = freshNavigation?.direction === 'previous'
    && freshNavigation.fromPositionMs != null && frame.positionMs != null
    && frame.positionMs < freshNavigation.fromPositionMs - 1_000
  const delayedIdentityForRestart = state.awaitingIdentityNavigation != null
    && navigation?.id === state.awaitingIdentityNavigation
    && now - navigation.requestedAt <= 2_500
    && frame.trackKey !== state.visible.trackKey
  if (delayedIdentityForRestart) {
    // Previous can first reset the current session position, then publish the
    // destination identity. Both updates acknowledge the same command.
    return { ...state, visible: frame, awaitingIdentityNavigation: null }
  }
  const awaitingIdentityNavigation = state.awaitingIdentityNavigation != null
    && navigation?.id === state.awaitingIdentityNavigation
    && now - navigation.requestedAt <= 2_500
      ? state.awaitingIdentityNavigation : null
  if (frame.trackKey !== state.visible.trackKey || restartedPrevious) {
    return {
      ...state, pending: frame, phase: 'exiting',
      direction: freshNavigation?.direction ?? 'next',
      consumedNavigation: navigation?.id ?? state.consumedNavigation,
      awaitingIdentityNavigation: restartedPrevious
        ? freshNavigation?.id ?? null
        : awaitingIdentityNavigation,
    }
  }
  return { ...state, visible: frame, awaitingIdentityNavigation }
}

/** Only the visual exit completion reveals the pending provider frame. */
export function completeProgressTransition(state: ProgressTransition): ProgressTransition {
  if (state.phase !== 'exiting' || !state.pending) return state
  const awaitingIdentityNavigation = state.awaitingIdentityNavigation != null
    && state.pending.trackKey === state.visible.trackKey
      ? state.awaitingIdentityNavigation : null
  return {
    ...state,
    visible: state.pending,
    pending: null,
    phase: 'stable',
    awaitingIdentityNavigation,
    generation: state.generation + 1,
  }
}
