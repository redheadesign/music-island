import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { disable as disableAutostart, enable as enableAutostart } from '@tauri-apps/plugin-autostart'
import type { AppConfig, MediaCommand, MediaSnapshot, UpdateCheckResult } from '../shared/lib/types'

const fallbackSnapshot: MediaSnapshot = {
  hasSession: false,
  sourceAppId: null,
  title: null,
  artist: null,
  albumTitle: null,
  playbackStatus: 'no-session',
  positionMs: null,
  durationMs: null,
  canSeek: false,
  canGoNext: false,
  canGoPrevious: false,
  canPlay: false,
  canPause: false,
  thumbnailDataUrl: null,
  updatedAt: new Date().toISOString(),
}

export async function getMediaSnapshot(): Promise<MediaSnapshot> {
  if (!isTauriRuntime()) {
    return {
      ...fallbackSnapshot,
      hasSession: true,
      sourceAppId: 'Spotify.exe',
      title: 'Aesthetic Morning',
      artist: 'Local SMTC Preview',
      albumTitle: 'Music Island Demo',
      playbackStatus: 'playing',
      positionMs: 73_000,
      durationMs: 214_000,
      canGoNext: true,
      canGoPrevious: true,
      canPause: true,
      canPlay: true,
    }
  }

  return invoke<MediaSnapshot>('get_media_snapshot')
}

export async function sendMediaCommand(command: MediaCommand): Promise<void> {
  if (!isTauriRuntime()) {
    return
  }

  await invoke('media_control', { command })
}

export async function getConfig(): Promise<AppConfig> {
  if (!isTauriRuntime()) {
    return getDefaultConfig()
  }

  return invoke<AppConfig>('get_config')
}

export async function saveConfig(config: AppConfig): Promise<AppConfig> {
  if (!isTauriRuntime()) {
    return config
  }

  return invoke<AppConfig>('save_config', { config })
}

export async function resetWindowPosition(): Promise<void> {
  if (!isTauriRuntime()) {
    return
  }

  await invoke('reset_window_position')
}

export async function setOverlayBounds(
  expanded: boolean,
  visualWidth: number,
  visualHeight: number,
): Promise<void> {
  if (!isTauriRuntime()) {
    return
  }

  await invoke('set_overlay_bounds', {
    expanded,
    visualWidth,
    visualHeight,
  })
}

export interface CollapsedGestureState {
  active: boolean
  localX: number
  localY: number
  clientX: number
  clientY: number
  inTopEdge: boolean
  windowWidth: number
  windowHeight: number
}

export async function getCollapsedGestureState(): Promise<CollapsedGestureState> {
  if (!isTauriRuntime()) {
    return {
      active: false,
      localX: 0,
      localY: 0,
      clientX: 0,
      clientY: 0,
      inTopEdge: false,
      windowWidth: 0,
      windowHeight: 0,
    }
  }

  return invoke<CollapsedGestureState>('get_collapsed_gesture_state')
}

export async function openSettingsWindow(): Promise<void> {
  if (!isTauriRuntime()) {
    return
  }

  await invoke('open_settings_window')
}

export async function copyDiagnostics(): Promise<string> {
  if (!isTauriRuntime()) {
    return 'Diagnostics are available in the installed Tauri application.'
  }

  return invoke<string>('copy_diagnostics')
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  if (!isTauriRuntime()) {
    return {
      enabled: false,
      hasUpdate: false,
      currentVersion: 'dev',
      message: 'Updater is disabled in browser preview.',
    }
  }

  return invoke<UpdateCheckResult>('check_for_updates')
}

export async function onMediaUpdate(callback: (snapshot: MediaSnapshot) => void): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined
  }

  const unlistenMedia = await listen<MediaSnapshot>('media:update', (event) => callback(event.payload))
  const unlistenTimeline = await listen<MediaSnapshot>('timeline:update', (event) => callback(event.payload))

  return () => {
    unlistenMedia()
    unlistenTimeline()
  }
}

export async function onOverlayAction(action: 'open-settings' | 'check-updates', callback: () => void): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined
  }

  return listen(`overlay:${action}`, callback)
}

export async function setAutostart(enabled: boolean): Promise<void> {
  if (!isTauriRuntime()) {
    return
  }

  if (enabled) {
    await enableAutostart()
  } else {
    await disableAutostart()
  }
}

export function getDefaultConfig(): AppConfig {
  return defaultConfig
}

function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window
}

const defaultConfig: AppConfig = {
  schemaVersion: 1,
  appearance: {
    theme: 'liquid-glass-dark',
    accentColor: '#8fb8ff',
    opacity: 0.92,
    blurStrength: 28,
    cornerRadius: 30,
    reducedMotion: false,
  },
  layout: {
    size: 'medium',
    scale: 100,
    density: 'balanced',
    showArtwork: true,
    showTitle: true,
    showArtist: true,
    showProgress: true,
    showSource: true,
    showPreviousNext: true,
    preset: 'album-pill',
  },
  behavior: {
    hoverDelayMs: 45,
    autoCollapseMs: 900,
    pinExpanded: false,
    alwaysOnTop: true,
    launchAtStartup: false,
    hideOverFullscreen: true,
    monitorId: null,
  },
  modules: {
    activeModule: 'music',
    enabledModules: ['music'],
  },
  privacy: {
    telemetryEnabled: false,
    writeDetailedLogs: false,
  },
}
