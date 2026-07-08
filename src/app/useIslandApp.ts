import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  checkForUpdates,
  getConfig,
  getDefaultConfig,
  getMediaSnapshot,
  onMediaUpdate,
  onOverlayAction,
  openSettingsWindow,
  resetWindowPosition,
  saveConfig,
  sendMediaCommand,
  setAutostart,
} from './tauriApi'
import { applyLayoutPreset } from '../features/settings/settingsPresets'
import type { AppConfig, MediaCommand, MediaSnapshot, UpdateCheckResult } from '../shared/lib/types'
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
  setMode: (mode: OverlayMode) => void
  updateConfig: (config: AppConfig) => Promise<void>
  applyPreset: (preset: AppConfig['layout']['preset']) => Promise<void>
  sendCommand: (command: MediaCommand) => Promise<void>
  resetPosition: () => Promise<void>
  openSettingsWindow: () => Promise<void>
  checkUpdates: () => Promise<UpdateCheckResult>
}

export function useIslandApp(): IslandAppState {
  const [config, setConfig] = useState<AppConfig>(() => getDefaultConfig())
  const [media, setMedia] = useState<MediaSnapshot | null>(null)
  const [mode, setMode] = useState<OverlayMode>('idle')
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const noSessionTimerRef = useRef<number | null>(null)
  const pendingSeekRef = useRef<{ positionMs: number; untilMs: number; preservePlaying: boolean } | null>(null)
  const sessionHoldRef = useRef<SessionHold | null>(null)
  const mediaRef = useRef<MediaSnapshot | null>(null)
  const lastSeekDispatchRef = useRef<{ positionMs: number; atMs: number } | null>(null)
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

    Promise.all([getConfig(), getMediaSnapshot()])
      .then(([nextConfig, snapshot]) => {
        if (!mounted) {
          return
        }
        setConfig(nextConfig)
        setMedia(snapshot)
        setMode(snapshot.hasSession ? 'compact' : 'no-session')
        void setAutostart(nextConfig.behavior.launchAtStartup)
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
  }, [])

  useEffect(() => {
    let cleanup: () => void = () => undefined

    onMediaUpdate((snapshot) => {
      setMedia((current) => reconcileMedia(current, snapshot))
    }).then((unlisten) => {
      cleanup = unlisten
    })

    return () => cleanup()
  }, [reconcileMedia])

  useEffect(() => {
    if (media?.hasSession && mode === 'no-session') {
      setMode('compact')
    }
  }, [media?.hasSession, mode])

  useEffect(() => {
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
  }, [])

  useEffect(() => {
    if (media?.playbackStatus !== 'playing') {
      return
    }

    const interval = window.setInterval(() => setNowMs(Date.now()), 250)
    return () => window.clearInterval(interval)
  }, [media?.playbackStatus])

  useEffect(() => {
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
  }, [media?.hasSession, mode])

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

  const applyPreset = useCallback(
    async (preset: AppConfig['layout']['preset']) => {
      if (!config) {
        return
      }

      const presetConfig = applyLayoutPreset(config, preset)
      await updateConfig(presetConfig)
    },
    [config, updateConfig],
  )

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
      const snapshot = await getMediaSnapshot()
      setMedia((current) => reconcileMedia(current, snapshot))
    } catch {
      pendingSeekRef.current = null
    }
  }, [reconcileMedia])

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
    setMode,
    updateConfig,
    applyPreset,
    sendCommand,
    resetPosition: resetWindowPosition,
    openSettingsWindow,
    checkUpdates,
  }
}
