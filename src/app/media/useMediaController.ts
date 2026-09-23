import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  MediaCommand,
  MediaSessionInfo,
  MediaSnapshot,
  SmtcHealthSnapshot,
} from '../../shared/lib/types'
import {
  getMediaSnapshot,
  getSmtcHealth,
  listMediaSessions,
  onMediaUpdate,
  onSmtcHealth,
  onTimelineUpdate,
  sendMediaCommand,
} from '../tauriApi'
import {
  applyOptimisticSeek,
  applySessionHold,
  getInterpolatedPosition,
  mergeMediaSnapshot,
  type SessionHold,
  isSameTrack,
} from '../playbackClock'
import { mediaSessionsEqual, shouldDispatchSeek } from './mediaModel'

const INITIAL_SMTC_HEALTH: SmtcHealthSnapshot = {
  status: 'healthy',
  consecutiveFailures: 0,
  lastProbeMs: 0,
  lastError: null,
  sessionCount: 0,
}

interface MediaControllerOptions {
  enabled: boolean
  configLoaded: boolean
  protocol: 'smtc' | 'yandex-direct'
  timelineEnabled?: boolean
}

interface MediaController {
  media: MediaSnapshot | null
  mediaLoaded: boolean
  mediaLoadFailed: boolean
  progressMs: number | null
  progressPercent: number
  smtcHealth: SmtcHealthSnapshot
  mediaSessions: MediaSessionInfo[]
  refreshMediaSessions: () => Promise<void>
  sendCommand: (command: MediaCommand) => Promise<void>
}

export function useMediaController({
  enabled,
  configLoaded,
  protocol,
  timelineEnabled = true,
}: MediaControllerOptions): MediaController {
  const [media, setMedia] = useState<MediaSnapshot | null>(null)
  const [mediaLoaded, setMediaLoaded] = useState(false)
  const [mediaLoadFailed, setMediaLoadFailed] = useState(false)
  const [smtcHealth, setSmtcHealth] = useState(INITIAL_SMTC_HEALTH)
  const [mediaSessions, setMediaSessions] = useState<MediaSessionInfo[]>([])
  const [nowMs, setNowMs] = useState(() => Date.now())
  const pendingSeekRef = useRef<{ positionMs: number; untilMs: number; preservePlaying: boolean; track: MediaSnapshot; generation: number } | null>(null)
  const commandGeneration = useRef(0)
  const sessionHoldRef = useRef<SessionHold | null>(null)
  const mediaRef = useRef<MediaSnapshot | null>(null)
  const lastSeekDispatchRef = useRef<{ positionMs: number; atMs: number } | null>(null)
  const sessionRefreshRef = useRef<Promise<void> | null>(null)
  mediaRef.current = media

  const reconcileMedia = useCallback((current: MediaSnapshot | null, snapshot: MediaSnapshot) => {
    if (snapshot.provider !== protocol || (snapshot.generation ?? 0) < (current?.generation ?? 0)) return current
    const now = Date.now()
    if (pendingSeekRef.current && (!isSameTrack(pendingSeekRef.current.track, snapshot) || pendingSeekRef.current.track.provider !== snapshot.provider || pendingSeekRef.current.track.sourceAppId !== snapshot.sourceAppId || now >= pendingSeekRef.current.untilMs)) pendingSeekRef.current = null
    const merged = mergeMediaSnapshot(current, snapshot, pendingSeekRef.current, now)
    const held = applySessionHold(current, merged, sessionHoldRef.current, now)
    sessionHoldRef.current = held.hold
    return held.snapshot
  }, [protocol])

  useEffect(() => {
    pendingSeekRef.current = null
    sessionHoldRef.current = null
    lastSeekDispatchRef.current = null
    commandGeneration.current++
  }, [protocol, enabled])

  useEffect(() => {
    let active = true
    void getSmtcHealth().then((health) => {
      if (active) setSmtcHealth(health)
    }).catch(() => undefined)
    let cleanup: () => void = () => undefined
    void onSmtcHealth((health) => {
      if (active) setSmtcHealth(health)
    }).then((unlisten) => {
      if (active) cleanup = unlisten
      else unlisten()
    }).catch(() => undefined)
    return () => {
      active = false
      cleanup()
    }
  }, [])

  useEffect(() => {
    if (!configLoaded) return
    let mounted = true

    if (enabled) {
      getMediaSnapshot()
        .then((snapshot) => {
          if (!mounted) return
          setMedia((current) => reconcileMedia(current, snapshot))
          setMediaLoaded(true)
        })
        .catch(() => {
          if (!mounted) return
          setMediaLoadFailed(true)
          setMediaLoaded(true)
        })
    } else {
      setMediaLoaded(true)
      if (protocol === 'smtc') {
        void listMediaSessions().then((sessions) => {
          if (mounted && sessions.length > 0) setMediaSessions(sessions)
        }).catch(() => undefined)
      }
    }

    return () => {
      mounted = false
    }
  }, [configLoaded, enabled, protocol, reconcileMedia])

  useEffect(() => {
    if (!enabled) return
    let active = true
    let cleanupMedia: () => void = () => undefined

    void onMediaUpdate((snapshot) => {
      if (active) setMedia((current) => reconcileMedia(current, snapshot))
    }).then((unlisten) => {
      if (active) cleanupMedia = unlisten
      else unlisten()
    }).catch(() => undefined)

    return () => {
      active = false
      cleanupMedia()
    }
  }, [enabled, reconcileMedia])

  useEffect(() => {
    if (!enabled || !timelineEnabled) return
    let active = true
    let cleanupTimeline: () => void = () => undefined

    void onTimelineUpdate((timeline) => {
      if (active) setMedia((current) => {
        if (!current || (timeline.generation ?? 0) !== (current.generation ?? 0) || current.provider !== timeline.provider || current.sourceAppId !== timeline.sourceAppId || (current.trackId || current.title) !== (timeline.trackId || timeline.title) || Date.parse(timeline.updatedAt) < Date.parse(current.updatedAt)) return current
        return reconcileMedia(current, { ...current, positionMs: timeline.positionMs, durationMs: timeline.durationMs, playbackStatus: timeline.playbackStatus, updatedAt: timeline.updatedAt })
      })
    }).then((unlisten) => {
      if (active) cleanupTimeline = unlisten
      else unlisten()
    }).catch(() => undefined)

    return () => {
      active = false
      cleanupTimeline()
    }
  }, [enabled, reconcileMedia, timelineEnabled])

  useEffect(() => {
    if (!enabled || !timelineEnabled || media?.playbackStatus !== 'playing') return
    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [enabled, media?.playbackStatus, timelineEnabled])

  const progressMs = useMemo(
    () => media?.positionMs == null ? null : getInterpolatedPosition(media, nowMs),
    [media, nowMs],
  )
  const progressPercent = useMemo(() => {
    if (progressMs == null || !media?.durationMs) return 0
    return Math.max(0, Math.min(100, (progressMs / media.durationMs) * 100))
  }, [media?.durationMs, progressMs])

  const refreshMediaSessions = useCallback(async () => {
    if (sessionRefreshRef.current) return sessionRefreshRef.current
    const refresh = listMediaSessions()
      .then((sessions) => {
        if (sessions.length === 0) return
        setMediaSessions((current) => mediaSessionsEqual(current, sessions) ? current : sessions)
      })
      .catch(() => undefined)
      .finally(() => {
        sessionRefreshRef.current = null
      })
    sessionRefreshRef.current = refresh
    return refresh
  }, [])

  const sendCommand = useCallback(async (command: MediaCommand) => {
    if (typeof command === 'object' && 'seek' in command) {
      const current = mediaRef.current
      if (!current?.hasSession) return
      const targetPosition = command.seek.positionMs
      const now = Date.now()
      if (!shouldDispatchSeek(current?.positionMs ?? 0, targetPosition, lastSeekDispatchRef.current, now)) return

      lastSeekDispatchRef.current = { positionMs: targetPosition, atMs: now }
      const jumpMs = Math.abs(targetPosition - (current?.positionMs ?? 0))
      pendingSeekRef.current = {
        track: current,
        generation: ++commandGeneration.current,
        positionMs: targetPosition,
        untilMs: now + (jumpMs > 20_000 ? 4_000 : 1_800),
        preservePlaying: current?.playbackStatus === 'playing',
      }
      setMedia((currentMedia) =>
        currentMedia ? applyOptimisticSeek(currentMedia, targetPosition) : currentMedia,
      )
      const generation = commandGeneration.current
      void sendMediaCommand(command).catch(() => {
        if (pendingSeekRef.current?.generation === generation) pendingSeekRef.current = null
      })
      return
    }

    const generation = ++commandGeneration.current
    if (command === 'next' || command === 'previous' || command === 'stop') {
      pendingSeekRef.current = null
      lastSeekDispatchRef.current = null
      sessionHoldRef.current = null
    }
    try {
      await sendMediaCommand(command)
    } catch {
      if (commandGeneration.current === generation) pendingSeekRef.current = null
    }
  }, [])

  return {
    media,
    mediaLoaded,
    mediaLoadFailed,
    progressMs,
    progressPercent,
    smtcHealth,
    mediaSessions,
    refreshMediaSessions,
    sendCommand,
  }
}
