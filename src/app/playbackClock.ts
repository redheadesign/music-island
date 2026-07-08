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

const TRANSIENT_PAUSE_STATUSES: PlaybackStatus[] = ['paused', 'changing', 'opened']
const SEEK_CONFIRM_TOLERANCE_MS = 2_000

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
  if (previous?.hasSession && !next.hasSession) {
    const transitional =
      next.playbackStatus === 'changing' ||
      next.playbackStatus === 'opened' ||
      next.playbackStatus === 'closed'
    if (transitional) {
      return {
        ...previous,
        playbackStatus: next.playbackStatus,
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

  if (pendingSeek && nowMs < pendingSeek.untilMs) {
    const incomingPosition = next.positionMs ?? 0
    const confirmed = Math.abs(incomingPosition - pendingSeek.positionMs) <= SEEK_CONFIRM_TOLERANCE_MS
    let merged = withAnchor(
      next,
      confirmed ? incomingPosition : pendingSeek.positionMs,
      nowMs,
    )

    if (pendingSeek.preservePlaying && TRANSIENT_PAUSE_STATUSES.includes(next.playbackStatus)) {
      merged = {
        ...merged,
        playbackStatus: 'playing',
      }
    }

    return merged
  }

  const anchor = reconcilePlaybackAnchor(previous, next, nowMs)
  const anchorTimeMs = Date.parse(anchor.updatedAt)
  return withAnchor(next, anchor.positionMs, Number.isNaN(anchorTimeMs) ? nowMs : anchorTimeMs)
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
  return (
    previous.title === next.title &&
    previous.artist === next.artist &&
    previous.durationMs === next.durationMs &&
    previous.sourceAppId === next.sourceAppId
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
