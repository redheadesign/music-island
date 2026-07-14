import type { MediaSessionInfo } from '../../shared/lib/types'

export function mediaSessionsEqual(left: MediaSessionInfo[], right: MediaSessionInfo[]): boolean {
  return left.length === right.length && left.every((session, index) => (
    session.sourceAppId === right[index]?.sourceAppId
    && session.playbackStatus === right[index]?.playbackStatus
    && session.isCurrent === right[index]?.isCurrent
  ))
}

export function shouldDispatchSeek(
  currentPosition: number,
  targetPosition: number,
  lastDispatch: { positionMs: number; atMs: number } | null,
  nowMs: number,
): boolean {
  if (
    lastDispatch
    && nowMs - lastDispatch.atMs < 80
    && Math.abs(lastDispatch.positionMs - targetPosition) < 50
  ) {
    return false
  }
  return Math.abs(targetPosition - currentPosition) >= 350
}
