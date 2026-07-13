import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  checkForUpdates,
  getConfig,
  getDefaultConfig,
  getMediaSnapshot,
  getSmtcHealth,
  listMediaSessions,
  onConfigChanged,
  onMediaUpdate,
  onOverlayAction,
  onSmtcHealth,
  onTimelineUpdate,
  openSettingsWindow,
  resetWindowPosition,
  saveConfig,
  sendMediaCommand,
  setAutostart,
} from './tauriApi'
import type {
  AppConfig,
  MediaCommand,
  MediaSessionInfo,
  MediaSnapshot,
  SmtcHealthSnapshot,
  UpdateCheckResult,
} from '../shared/lib/types'
import {
  applyOptimisticSeek,
  applySessionHold,
  getInterpolatedPosition,
  mergeMediaSnapshot,
  type SessionHold,
} from './playbackClock'

export type OverlayMode = 'idle' | 'peek' | 'compact' | 'expanded' | 'pinned' | 'settings' | 'no-session'

export interface IslandAppState {
  config: AppConfig
  media: MediaSnapshot | null
  mode: OverlayMode
  updateMessage: string | null
  progressMs: number | null
  progressPercent: number
  smtcHealth: SmtcHealthSnapshot
  mediaSessions: MediaSessionInfo[]
  setMode: (mode: OverlayMode) => void
  updateConfig: (config: AppConfig) => Promise<void>
  refreshMediaSessions: () => Promise<void>
  sendCommand: (command: MediaCommand) => Promise<void>
  resetPosition: () => Promise<void>
  openSettingsWindow: () => Promise<void>
  checkUpdates: () => Promise<UpdateCheckResult>
}

interface UseIslandAppOptions {
  mediaEnabled?: boolean
}

export function useIslandApp({ mediaEnabled = true }: UseIslandAppOptions = {}): IslandAppState {
  const [config, setConfig] = useState<AppConfig>(() => getDefaultConfig())
  const [media, setMedia] = useState<MediaSnapshot | null>(null)
  const [mode, setMode] = useState<OverlayMode>('idle')
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)
  const [smtcHealth, setSmtcHealth] = useState<SmtcHealthSnapshot>({
    status: 'healthy',
    consecutiveFailures: 0,
    lastProbeMs: 0,
    lastError: null,
    sessionCount: 0,
  })
  const [mediaSessions, setMediaSessions] = useState<MediaSessionInfo[]>([])
  const [nowMs, setNowMs] = useState(() => Date.now())
  const noSessionTimerRef = useRef<number | null>(null)
  const pendingSeekRef = useRef<{ positionMs: number; untilMs: number; preservePlaying: boolean } | null>(null)
  const sessionHoldRef = useRef<SessionHold | null>(null)
  const mediaRef = useRef<MediaSnapshot | null>(null)
  const lastSeekDispatchRef = useRef<{ positionMs: number; atMs: number } | null>(null)
  const sessionRefreshRef = useRef<Promise<void> | null>(null)
  mediaRef.current = media

  const reconcileMedia = useCallback((current: MediaSnapshot | null, snapshot: MediaSnapshot) => {
    const nowMs = Date.now()
    const merged = mergeMediaSnapshot(current, snapshot, pendingSeekRef.current, nowMs)
    const held = applySessionHold(current, merged, sessionHoldRef.current, nowMs)
    sessionHoldRef.current = held.hold
    return held.snapshot
  }, [])

  useEffect(() => {
    let mounted = true

    Promise.all([getConfig(), getSmtcHealth()])
      .then(async ([nextConfig, health]) => {
        if (!mounted) {
          return
        }
        setConfig(nextConfig)
        setSmtcHealth(health)
        if (mediaEnabled) {
          const snapshot = await getMediaSnapshot()
          if (!mounted) return
          setMedia(snapshot)
          setMode(snapshot.hasSession ? 'compact' : 'no-session')
          void setAutostart(nextConfig.behavior.launchAtStartup)
        } else if (nextConfig.media.protocol === 'smtc') {
          const sessions = await listMediaSessions().catch(() => [])
          if (mounted && sessions.length > 0) setMediaSessions(sessions)
        }
      })
      .catch(() => {
        if (mounted) {
          setConfig(getDefaultConfig())
          setMode('no-session')
        }
      })

    return () => {
      mounted = false
    }
  }, [mediaEnabled])

  useEffect(() => {
    if (!mediaEnabled) {
      return
    }
    let cleanup: () => void = () => undefined
    let cleanupTimeline: () => void = () => undefined

    onMediaUpdate((snapshot) => {
      setMedia((current) => reconcileMedia(current, snapshot))
    }).then((unlisten) => {
      cleanup = unlisten
    })
    onTimelineUpdate((timeline) => {
      setMedia((current) => {
        if (!current || current.provider !== timeline.provider) return current
        return reconcileMedia(current, {
          ...current,
          positionMs: timeline.positionMs,
          durationMs: timeline.durationMs,
          playbackStatus: timeline.playbackStatus,
          updatedAt: timeline.updatedAt,
        })
      })
    }).then((unlisten) => {
      cleanupTimeline = unlisten
    })

    return () => {
      cleanup()
      cleanupTimeline()
    }
  }, [mediaEnabled, reconcileMedia])

  useEffect(() => {
    let stopHealth: () => void = () => undefined
    let stopConfig: () => void = () => undefined
    onSmtcHealth(setSmtcHealth).then((unlisten) => {
      stopHealth = unlisten
    })
    onConfigChanged(setConfig).then((unlisten) => {
      stopConfig = unlisten
    })
    return () => {
      stopHealth()
      stopConfig()
    }
  }, [])

  useEffect(() => {
    if (!mediaEnabled) {
      return
    }
    if (media?.hasSession && mode === 'no-session') {
      setMode('compact')
    }
  }, [media?.hasSession, mediaEnabled, mode])

  useEffect(() => {
    if (!mediaEnabled) {
      return
    }
    let cleanupSettings: () => void = () => undefined
    let cleanupUpdates: () => void = () => undefined

    onOverlayAction('open-settings', () => {
      setMode('settings')
      void openSettingsWindow()
    }).then((unlisten) => {
      cleanupSettings = unlisten
    })

    onOverlayAction('check-updates', () => {
      void checkForUpdates().then((result) => setUpdateMessage(result.message))
    }).then((unlisten) => {
      cleanupUpdates = unlisten
    })

    return () => {
      cleanupSettings()
      cleanupUpdates()
    }
  }, [mediaEnabled])

  useEffect(() => {
    if (!mediaEnabled || media?.playbackStatus !== 'playing') {
      return
    }

    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [media?.playbackStatus, mediaEnabled])

  useEffect(() => {
    if (!mediaEnabled) {
      return
    }
    if (noSessionTimerRef.current) {
      window.clearTimeout(noSessionTimerRef.current)
      noSessionTimerRef.current = null
    }

    if (media?.hasSession || mode === 'settings' || mode === 'expanded') {
      return
    }

    noSessionTimerRef.current = window.setTimeout(() => {
      setMode((currentMode) => (currentMode === 'settings' || currentMode === 'expanded' ? currentMode : 'no-session'))
    }, 2_500)

    return () => {
      if (noSessionTimerRef.current) {
        window.clearTimeout(noSessionTimerRef.current)
      }
    }
  }, [media?.hasSession, mediaEnabled, mode])

  const progressMs = useMemo(() => {
    if (media?.positionMs == null) {
      return null
    }

    return getInterpolatedPosition(media, nowMs)
  }, [media, nowMs])

  const progressPercent = useMemo(() => {
    if (progressMs == null || !media?.durationMs) {
      return 0
    }
    return Math.max(0, Math.min(100, (progressMs / media.durationMs) * 100))
  }, [media?.durationMs, progressMs])

  const updateConfig = useCallback(async (nextConfig: AppConfig) => {
    const saved = await saveConfig(nextConfig)
    setConfig(saved)
    await setAutostart(saved.behavior.launchAtStartup)
  }, [])

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
      const wasPlaying = current?.playbackStatus === 'playing'
      const currentPosition = current?.positionMs ?? 0
      const targetPosition = command.seek.positionMs
      const jumpMs = Math.abs(targetPosition - currentPosition)
      const now = Date.now()
      const lastDispatch = lastSeekDispatchRef.current

      // Dedupe only accidental double-fire from the same release, not rapid user seeks.
      if (
        lastDispatch &&
        now - lastDispatch.atMs < 80 &&
        Math.abs(lastDispatch.positionMs - targetPosition) < 50
      ) {
        return
      }

      if (jumpMs < 350) {
        return
      }

      lastSeekDispatchRef.current = { positionMs: targetPosition, atMs: now }
      const isLargeJump = jumpMs > 20_000

      pendingSeekRef.current = {
        positionMs: targetPosition,
        untilMs: now + (isLargeJump ? 4_000 : 1_800),
        preservePlaying: wasPlaying,
      }
      setMedia((currentMedia) =>
        currentMedia ? applyOptimisticSeek(currentMedia, targetPosition) : currentMedia,
      )
      void sendMediaCommand(command).catch(() => {
        pendingSeekRef.current = null
      })
      return
    }

    try {
      await sendMediaCommand(command)
    } catch {
      pendingSeekRef.current = null
    }
  }, [])

  const checkUpdates = useCallback(async () => {
    const result = await checkForUpdates()
    setUpdateMessage(result.message)
    return result
  }, [])

  return {
    config,
    media,
    mode,
    updateMessage,
    progressMs,
    progressPercent,
    smtcHealth,
    mediaSessions,
    setMode,
    updateConfig,
    refreshMediaSessions,
    sendCommand,
    resetPosition: resetWindowPosition,
    openSettingsWindow,
    checkUpdates,
  }
}

function mediaSessionsEqual(left: MediaSessionInfo[], right: MediaSessionInfo[]): boolean {
  return left.length === right.length && left.every((session, index) => (
    session.sourceAppId === right[index]?.sourceAppId
    && session.playbackStatus === right[index]?.playbackStatus
    && session.isCurrent === right[index]?.isCurrent
  ))
}
