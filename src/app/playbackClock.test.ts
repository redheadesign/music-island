import { describe, expect, it } from 'vitest'
import {
  applySessionHold,
  getInterpolatedPosition,
  mergeMediaSnapshot,
  reconcilePlaybackAnchor,
} from './playbackClock'
import type { MediaSnapshot } from '../shared/lib/types'

function snapshot(overrides: Partial<MediaSnapshot> = {}): MediaSnapshot {
  return {
    hasSession: true,
    sourceAppId: 'Spotify.exe',
    title: 'Track',
    artist: 'Artist',
    albumTitle: null,
    playbackStatus: 'playing',
    positionMs: 60_000,
    durationMs: 180_000,
    canSeek: true,
    canGoNext: true,
    canGoPrevious: true,
    canPlay: true,
    canPause: true,
    canLike: false,
    canDislike: false,
    isLiked: false,
    isDisliked: false,
    thumbnailDataUrl: null,
    updatedAt: '2026-07-08T12:00:00.000Z',
    provider: 'smtc',
    smtcHealth: 'healthy',
    ...overrides,
  }
}

describe('playbackClock', () => {
  it('interpolates position while playing', () => {
    const media = snapshot({ positionMs: 10_000, updatedAt: '2026-07-08T12:00:00.000Z' })
    const nowMs = Date.parse('2026-07-08T12:00:02.500Z')

    expect(getInterpolatedPosition(media, nowMs)).toBe(12_500)
  })

  it('ignores stale SMTC polls that lag behind the local clock', () => {
    const previous = snapshot({ positionMs: 60_000, updatedAt: '2026-07-08T12:00:00.000Z' })
    const next = snapshot({ positionMs: 59_200, updatedAt: '2026-07-08T12:00:01.000Z' })
    const nowMs = Date.parse('2026-07-08T12:00:01.000Z')

    const anchor = reconcilePlaybackAnchor(previous, next, nowMs)

    expect(anchor.positionMs).toBe(60_000)
    expect(anchor.updatedAt).toBe(previous.updatedAt)
  })

  it('re-anchors on seek jumps forward', () => {
    const previous = snapshot({ positionMs: 60_000, updatedAt: '2026-07-08T12:00:00.000Z' })
    const next = snapshot({ positionMs: 120_000, updatedAt: '2026-07-08T12:00:01.000Z' })
    const nowMs = Date.parse('2026-07-08T12:00:01.000Z')

    const merged = mergeMediaSnapshot(previous, next, null, nowMs)

    expect(merged.positionMs).toBe(120_000)
  })

  it('re-anchors on seek jumps backward', () => {
    const previous = snapshot({ positionMs: 90_000, updatedAt: '2026-07-08T12:00:00.000Z' })
    const next = snapshot({ positionMs: 30_000, updatedAt: '2026-07-08T12:00:10.000Z' })
    const nowMs = Date.parse('2026-07-08T12:00:10.000Z')

    const merged = mergeMediaSnapshot(previous, next, null, nowMs)

    expect(merged.positionMs).toBe(30_000)
  })

  it('never re-anchors backward when SMTC position lags by ten seconds', () => {
    const previous = snapshot({ positionMs: 60_000, updatedAt: '2026-07-08T12:00:00.000Z' })
    const next = snapshot({ positionMs: 60_000, updatedAt: '2026-07-08T12:00:10.000Z' })
    const nowMs = Date.parse('2026-07-08T12:00:10.000Z')

    const anchor = reconcilePlaybackAnchor(previous, next, nowMs)

    expect(anchor.positionMs).toBe(60_000)
    expect(anchor.updatedAt).toBe(previous.updatedAt)
  })

  it('keeps the previous session visible while SMTC reports a track change', () => {
    const previous = snapshot({ title: 'Old track' })
    const next = snapshot({
      hasSession: false,
      title: null,
      playbackStatus: 'changing',
    })

    const merged = mergeMediaSnapshot(previous, next)

    expect(merged.hasSession).toBe(true)
    expect(merged.title).toBe('Old track')
    expect(merged.playbackStatus).toBe('changing')
  })

  it('keeps the previous session visible during transient no-session polls', () => {
    const previous = snapshot({ title: 'Still playing' })
    const next = snapshot({
      hasSession: false,
      title: null,
      artist: null,
      playbackStatus: 'no-session',
    })

    const merged = mergeMediaSnapshot(previous, next)

    expect(merged.hasSession).toBe(true)
    expect(merged.title).toBe('Still playing')
    expect(merged.playbackStatus).toBe('changing')
  })

  it('extends session hold when merge cannot mask a session drop', () => {
    const previous = snapshot({ title: 'Held track' })
    const lost = snapshot({
      hasSession: false,
      title: null,
      playbackStatus: 'stopped',
    })
    const nowMs = Date.parse('2026-07-08T12:00:00.000Z')
    const merged = mergeMediaSnapshot(previous, lost, null, nowMs)
    const held = applySessionHold(previous, merged, null, nowMs)

    expect(merged.hasSession).toBe(false)
    expect(held.snapshot.hasSession).toBe(true)
    expect(held.snapshot.title).toBe('Held track')
    expect(held.hold).not.toBeNull()
  })

  it('masks transient pause while a seek is pending', () => {
    const previous = snapshot({ positionMs: 60_000, playbackStatus: 'playing' })
    const next = snapshot({ positionMs: 60_000, playbackStatus: 'paused' })
    const pendingSeek = {
      positionMs: 120_000,
      untilMs: Date.now() + 2_000,
      preservePlaying: true,
    }

    const merged = mergeMediaSnapshot(previous, next, pendingSeek)

    expect(merged.playbackStatus).toBe('playing')
    expect(merged.positionMs).toBe(120_000)
  })
})
