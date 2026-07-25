import type { MediaSnapshot, PlaybackStatus } from '../shared/lib/types'

export interface PlaybackAnchor {
  positionMs: number
  updatedAt: string
}

export interface PendingSeek {
  positionMs: number
  untilMs: number
  preservePlaying: boolean
}

export interface SessionHold {
  snapshot: MediaSnapshot
  sinceMs: number
}

const TRANSIENT_NO_SESSION_STATUSES: PlaybackStatus[] = [
  'no-session',
  'changing',
  'opened',
  'closed',
]
const SESSION_HOLD_MS = 2_500
const SEEK_CONFIRM_TOLERANCE_MS = 2_000
const TRANSIENT_PAUSE_STATUSES: PlaybackStatus[] = ['paused', 'changing', 'opened']

export function getInterpolatedPosition(snapshot: MediaSnapshot, nowMs = Date.now()): number {
  const positionMs = snapshot.positionMs ?? 0
  if (snapshot.playbackStatus !== 'playing') {
    return positionMs
  }

  const updatedAt = Date.parse(snapshot.updatedAt)
  if (Number.isNaN(updatedAt)) {
    return positionMs
  }

  const elapsed = Math.max(nowMs - updatedAt, 0)
  const nextPosition = positionMs + elapsed
  return snapshot.durationMs ? Math.min(nextPosition, snapshot.durationMs) : nextPosition
}

export function applyOptimisticSeek(
  snapshot: MediaSnapshot,
  positionMs: number,
  nowMs = Date.now(),
): MediaSnapshot {
  const preservePlaying = snapshot.playbackStatus === 'playing'
  return {
    ...withAnchor(snapshot, positionMs, nowMs),
    playbackStatus: preservePlaying ? 'playing' : snapshot.playbackStatus,
  }
}

export function mergeMediaSnapshot(
  previous: MediaSnapshot | null,
  next: MediaSnapshot,
  pendingSeek: PendingSeek | null = null,
  nowMs = Date.now(),
): MediaSnapshot {
  if (previous && previous.provider !== next.provider) {
    return next
  }

  if (previous?.hasSession && !next.hasSession) {
    if (TRANSIENT_NO_SESSION_STATUSES.includes(next.playbackStatus)) {
      return {
        ...previous,
        playbackStatus: next.playbackStatus === 'no-session' ? 'changing' : next.playbackStatus,
        updatedAt: next.updatedAt,
      }
    }
  }

  if (!previous?.hasSession || !next.hasSession) {
    return next
  }

  if (!isSameTrack(previous, next)) {
    return next
  }

  const nextWithStableMetadata: MediaSnapshot = {
    ...next,
    artist: next.artist ?? previous.artist,
    albumTitle: next.albumTitle ?? previous.albumTitle,
    thumbnailDataUrl: next.thumbnailDataUrl ?? previous.thumbnailDataUrl,
  }

  if (pendingSeek && nowMs < pendingSeek.untilMs) {
    const incomingPosition = nextWithStableMetadata.positionMs ?? 0
    const confirmed = Math.abs(incomingPosition - pendingSeek.positionMs) <= SEEK_CONFIRM_TOLERANCE_MS
    let merged = withAnchor(
      nextWithStableMetadata,
      confirmed ? incomingPosition : pendingSeek.positionMs,
      nowMs,
    )

    if (pendingSeek.preservePlaying && TRANSIENT_PAUSE_STATUSES.includes(nextWithStableMetadata.playbackStatus)) {
      merged = {
        ...merged,
        playbackStatus: 'playing',
      }
    }

    return merged
  }

  const anchor = reconcilePlaybackAnchor(previous, nextWithStableMetadata, nowMs)
  const anchorTimeMs = Date.parse(anchor.updatedAt)
  return withAnchor(
    nextWithStableMetadata,
    anchor.positionMs,
    Number.isNaN(anchorTimeMs) ? nowMs : anchorTimeMs,
  )
}

export function reconcilePlaybackAnchor(
  previous: MediaSnapshot,
  next: MediaSnapshot,
  nowMs = Date.now(),
): PlaybackAnchor {
  const incomingPosition = next.positionMs ?? 0
  const incomingUpdatedAt = Date.parse(next.updatedAt)
  const previousUpdatedAt = Date.parse(previous.updatedAt)
  const previousAnchorPosition = previous.positionMs ?? 0

  if (next.playbackStatus !== 'playing') {
    return {
      positionMs: incomingPosition,
      updatedAt: next.updatedAt,
    }
  }

  if (Number.isNaN(incomingUpdatedAt)) {
    return anchorAt(incomingPosition, nowMs)
  }

  const displayPosition = getInterpolatedPosition(previous, nowMs)
  const forwardJump = incomingPosition - displayPosition
  const backwardJumpFromAnchor = previousAnchorPosition - incomingPosition
  const timelineAdvanced =
    Number.isNaN(previousUpdatedAt) || incomingUpdatedAt > previousUpdatedAt + 50

  if (!timelineAdvanced) {
    return {
      positionMs: previousAnchorPosition,
      updatedAt: previous.updatedAt,
    }
  }

  if (forwardJump >= 1_000 || backwardJumpFromAnchor >= 1_500) {
    return anchorAt(incomingPosition, incomingUpdatedAt)
  }

  // Accept only small forward corrections. Never snap backward on stale SMTC polls.
  if (forwardJump >= 0 && forwardJump <= 2_500) {
    return anchorAt(incomingPosition, incomingUpdatedAt)
  }

  return {
    positionMs: previousAnchorPosition,
    updatedAt: previous.updatedAt,
  }
}

function isSameTrack(previous: MediaSnapshot, next: MediaSnapshot): boolean {
  if (previous.sourceAppId !== next.sourceAppId) {
    return false
  }

  // Prefer stable track ids from Direct / SMTC when both sides have them.
  if (previous.trackId && next.trackId) {
    return previous.trackId === next.trackId
  }

  return (
    previous.title === next.title &&
    previous.durationMs === next.durationMs &&
    (previous.artist === next.artist || previous.artist == null || next.artist == null)
  )
}

function withAnchor(snapshot: MediaSnapshot, positionMs: number, anchorTimeMs: number): MediaSnapshot {
  return {
    ...snapshot,
    positionMs,
    updatedAt: new Date(anchorTimeMs).toISOString(),
  }
}

function anchorAt(positionMs: number, anchorTimeMs: number): PlaybackAnchor {
  return {
    positionMs,
    updatedAt: new Date(anchorTimeMs).toISOString(),
  }
}

export function applySessionHold(
  previous: MediaSnapshot | null,
  merged: MediaSnapshot,
  hold: SessionHold | null,
  nowMs = Date.now(),
): { snapshot: MediaSnapshot; hold: SessionHold | null } {
  if (previous && previous.provider !== merged.provider) {
    return { snapshot: merged, hold: null }
  }

  if (merged.hasSession) {
    return { snapshot: merged, hold: null }
  }

  const holdBase = hold?.snapshot ?? (previous?.hasSession ? previous : null)
  if (!holdBase?.hasSession) {
    return { snapshot: merged, hold: null }
  }

  const activeHold = hold ?? { snapshot: holdBase, sinceMs: nowMs }
  if (nowMs - activeHold.sinceMs < SESSION_HOLD_MS) {
    return {
      snapshot: {
        ...activeHold.snapshot,
        playbackStatus: 'changing',
        updatedAt: merged.updatedAt,
      },
      hold: activeHold,
    }
  }

  return { snapshot: merged, hold: null }
}
