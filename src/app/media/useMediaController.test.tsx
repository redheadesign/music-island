// @vitest-environment happy-dom
import { StrictMode, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaSnapshot } from '../../shared/lib/types'
import * as api from '../tauriApi'
import { useMediaController } from './useMediaController'

vi.mock('../tauriApi', () => ({
  getMediaSnapshot: vi.fn(),
  getSmtcHealth: vi.fn(),
  listMediaSessions: vi.fn(),
  onMediaUpdate: vi.fn(),
  onSmtcHealth: vi.fn(),
  onTimelineUpdate: vi.fn(),
  sendMediaCommand: vi.fn(),
}))

const snapshot: MediaSnapshot = {
  hasSession: true, sourceAppId: 'player', trackId: 'track-a',
  title: 'Track A', artist: 'Artist', albumTitle: null,
  playbackStatus: 'playing', positionMs: 10_000, durationMs: 120_000,
  canSeek: true, canGoNext: true, canGoPrevious: true, canPlay: true, canPause: true,
  canLike: false, canDislike: false, isLiked: false, isDisliked: false,
  canShuffle: false, isShuffleActive: false, canRepeat: false, repeatMode: 'off',
  activeWaveId: null, activeWaveTitle: null, thumbnailDataUrl: null,
  updatedAt: '2026-09-08T12:00:00.000Z', provider: 'smtc', smtcHealth: 'healthy',
}

type Options = Parameters<typeof useMediaController>[0]
const defaults: Options = { enabled: true, configLoaded: true, protocol: 'smtc' }
let root: Root
let container: HTMLDivElement
let current: ReturnType<typeof useMediaController>
let renders: number

function Probe({ options }: { options: Options }) {
  current = useMediaController(options)
  renders += 1
  return null
}

async function render(options: Options = defaults, strict = false) {
  await act(async () => {
    root.render(strict ? <StrictMode><Probe options={options} /></StrictMode> : <Probe options={options} />)
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(snapshot.updatedAt))
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.mocked(api.getMediaSnapshot).mockResolvedValue(snapshot)
  vi.mocked(api.getSmtcHealth).mockResolvedValue({ status: 'healthy', consecutiveFailures: 0, lastProbeMs: 1, lastError: null, sessionCount: 1 })
  vi.mocked(api.listMediaSessions).mockResolvedValue([])
  vi.mocked(api.sendMediaCommand).mockResolvedValue()
  vi.mocked(api.onMediaUpdate).mockResolvedValue(vi.fn())
  vi.mocked(api.onTimelineUpdate).mockResolvedValue(vi.fn())
  vi.mocked(api.onSmtcHealth).mockResolvedValue(vi.fn())
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  renders = 0
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('media controller timeline lifecycle', () => {
  it('does not reapply a seek to a new track after navigation', async () => {
    await render()
    await act(async () => { await current.sendCommand({ seek: { positionMs: 60_000 } }) })
    expect(current.media?.positionMs).toBe(60_000)
    await act(async () => { await current.sendCommand('next') })
    const next = { ...snapshot, trackId: 'track-b', title: 'Track B', positionMs: 0 }
    await act(async () => { vi.mocked(api.onMediaUpdate).mock.calls[0][0](next) })
    await act(async () => { vi.mocked(api.onTimelineUpdate).mock.calls[0][0]({ ...next, positionMs: 200 }) })
    expect(current.media?.positionMs).toBeLessThan(1_000)
  })

  it('ignores a late timeline from the previous track', async () => {
    await render()
    const next = { ...snapshot, trackId: 'track-b', title: 'Track B', positionMs: 0 }
    await act(async () => { vi.mocked(api.onMediaUpdate).mock.calls[0][0](next) })
    await act(async () => { vi.mocked(api.onTimelineUpdate).mock.calls[0][0]({ ...snapshot, positionMs: 60_000 }) })
    expect(current.media?.trackId).toBe('track-b')
    expect(current.media?.positionMs).toBe(0)
  })

  it('keeps timeline delivery and playing progress interpolation enabled by default', async () => {
    await render()
    expect(api.onTimelineUpdate).toHaveBeenCalledOnce()
    expect(current.progressMs).toBe(10_000)
    expect(vi.getTimerCount()).toBe(1)
    await act(async () => vi.advanceTimersByTime(1_000))
    expect(current.progressMs).toBe(11_000)

    await act(async () => {
      vi.mocked(api.onTimelineUpdate).mock.calls[0][0]({ ...snapshot, positionMs: 42_000, playbackStatus: 'paused' })
    })
    expect(current.media?.playbackStatus).toBe('paused')
    expect(current.progressMs).toBe(42_000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps taskbar metadata and commands live without timeline IPC or periodic renders', async () => {
    await render({ ...defaults, timelineEnabled: false })
    expect(api.onMediaUpdate).toHaveBeenCalledOnce()
    expect(api.onTimelineUpdate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    const idleRenders = renders
    await act(async () => vi.advanceTimersByTime(5_000))
    expect(renders).toBe(idleRenders)

    await act(async () => {
      vi.mocked(api.onMediaUpdate).mock.calls[0][0]({ ...snapshot, trackId: 'track-b', title: 'Track B', playbackStatus: 'paused' })
    })
    expect(current.media?.title).toBe('Track B')
    expect(current.media?.playbackStatus).toBe('paused')
    await current.sendCommand('next')
    expect(api.sendMediaCommand).toHaveBeenCalledExactlyOnceWith('next')
  })

  it('stops only the timeline subscription and clock when its consumer opts out', async () => {
    const unlisten = vi.fn()
    vi.mocked(api.onTimelineUpdate).mockResolvedValue(unlisten)
    await render()
    await render({ ...defaults, timelineEnabled: false })
    expect(unlisten).toHaveBeenCalledOnce()
    expect(api.onMediaUpdate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not start media delivery or a clock for a settings-only consumer', async () => {
    await render({ ...defaults, enabled: false })
    expect(api.getMediaSnapshot).not.toHaveBeenCalled()
    expect(api.onMediaUpdate).not.toHaveBeenCalled()
    expect(api.onTimelineUpdate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('disposes listeners whose registration resolves after StrictMode cleanup or unmount', async () => {
    const pending: Array<{ resolve: (cleanup: () => void) => void; cleanup: () => void }> = []
    const deferred = () => new Promise<() => void>((resolve) => pending.push({ resolve, cleanup: vi.fn<() => void>() }))
    vi.mocked(api.onMediaUpdate).mockImplementation(deferred)
    vi.mocked(api.onTimelineUpdate).mockImplementation(deferred)
    vi.mocked(api.onSmtcHealth).mockImplementation(deferred)
    await render(defaults, true)
    expect(pending).toHaveLength(6)
    await act(async () => root.unmount())
    await act(async () => {
      for (const listener of pending) listener.resolve(listener.cleanup)
    })
    for (const listener of pending) expect(listener.cleanup).toHaveBeenCalledOnce()
  })
})
