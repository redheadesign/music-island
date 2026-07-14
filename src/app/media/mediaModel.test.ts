import { describe, expect, it } from 'vitest'
import type { MediaSessionInfo } from '../../shared/lib/types'
import { mediaSessionsEqual, shouldDispatchSeek } from './mediaModel'

const session = (overrides: Partial<MediaSessionInfo> = {}): MediaSessionInfo => ({
  sourceAppId: 'Spotify.exe',
  playbackStatus: 'playing',
  isCurrent: true,
  ...overrides,
})

describe('media controller characterization', () => {
  it('preserves the existing session list when observable fields are unchanged', () => {
    expect(mediaSessionsEqual([session()], [session()])).toBe(true)
    expect(mediaSessionsEqual([session()], [session({ isCurrent: false })])).toBe(false)
    expect(mediaSessionsEqual([session()], [session({ playbackStatus: 'paused' })])).toBe(false)
  })

  it('ignores tiny seek movements and accidental duplicate releases', () => {
    expect(shouldDispatchSeek(10_000, 10_349, null, 1_000)).toBe(false)
    expect(shouldDispatchSeek(10_000, 10_350, null, 1_000)).toBe(true)
    expect(shouldDispatchSeek(10_000, 30_000, { positionMs: 30_010, atMs: 950 }, 1_000)).toBe(false)
  })

  it('allows rapid seeks when the target materially changes', () => {
    expect(shouldDispatchSeek(10_000, 40_000, { positionMs: 20_000, atMs: 950 }, 1_000)).toBe(true)
  })
})
