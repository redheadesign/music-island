import { useEffect, useRef, useState } from 'react'
import { useAppConfig } from './config/useAppConfig'
import type { IslandAppState, OverlayMode, UseIslandAppOptions } from './islandApp.types'
import { useDirectStatus } from './media/useDirectStatus'
import { useMediaController } from './media/useMediaController'
import { useWaveController } from './media/useWaveController'
import { useWindowController } from './window/useWindowController'

export type { IslandAppState, OverlayMode, UseIslandAppOptions } from './islandApp.types'

export function useIslandApp({ mediaEnabled = true }: UseIslandAppOptions = {}): IslandAppState {
  const [mode, setMode] = useState<OverlayMode>('idle')
  const noSessionTimerRef = useRef<number | null>(null)
  const initialMediaModeSetRef = useRef(false)
  const configController = useAppConfig(mediaEnabled)
  const mediaController = useMediaController({
    enabled: mediaEnabled,
    configLoaded: configController.configLoaded,
    protocol: configController.config.media.protocol,
  })
  const windowController = useWindowController(mediaEnabled, setMode)
  const waveController = useWaveController(mediaController.media)
  const directController = useDirectStatus(
    mediaEnabled && configController.config.media.protocol === 'yandex-direct',
  )

  useEffect(() => {
    if (!mediaEnabled || !mediaController.mediaLoaded || initialMediaModeSetRef.current) return
    initialMediaModeSetRef.current = true
    setMode(mediaController.media?.hasSession ? 'compact' : 'no-session')
  }, [mediaController.media?.hasSession, mediaController.mediaLoaded, mediaEnabled])

  useEffect(() => {
    if (configController.configLoadFailed || mediaController.mediaLoadFailed) setMode('no-session')
  }, [configController.configLoadFailed, mediaController.mediaLoadFailed])

  useEffect(() => {
    if (!mediaEnabled) {
      return
    }
    if (mediaController.media?.hasSession && mode === 'no-session') {
      setMode('compact')
    }
  }, [mediaController.media?.hasSession, mediaEnabled, mode])

  useEffect(() => {
    if (!mediaEnabled) {
      return
    }
    if (noSessionTimerRef.current) {
      window.clearTimeout(noSessionTimerRef.current)
      noSessionTimerRef.current = null
    }

    if (mediaController.media?.hasSession || mode === 'settings' || mode === 'expanded') {
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
  }, [mediaController.media?.hasSession, mediaEnabled, mode])

  return {
    config: configController.config,
    media: mediaController.media,
    mode,
    updateMessage: windowController.updateMessage,
    autostartError: configController.autostartError,
    autostartStatus: configController.autostartStatus,
    progressMs: mediaController.progressMs,
    progressPercent: mediaController.progressPercent,
    smtcHealth: mediaController.smtcHealth,
    mediaSessions: mediaController.mediaSessions,
    waveContext: waveController.waveContext,
    setMode,
    updateConfig: configController.updateConfig,
    refreshMediaSessions: mediaController.refreshMediaSessions,
    sendCommand: mediaController.sendCommand,
    refreshWaveContext: waveController.refreshWaveContext,
    selectWavePreset: waveController.selectWavePreset,
    clearWaveSelection: waveController.clearWaveSelection,
    resetPosition: windowController.resetPosition,
    openSettingsWindow: windowController.openSettingsWindow,
    checkUpdates: windowController.checkUpdates,
    directNeedsRecovery: directController.needsRecovery,
    directReloadBusy: directController.busy,
    restartDirect: directController.restartDirect,
  }
}
