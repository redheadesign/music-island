import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { openUrl } from '@tauri-apps/plugin-opener'
import type {
  AutostartSyncEvent,
  AppConfig,
  DirectYandexStatus,
  MediaCommand,
  MediaSessionInfo,
  MediaSnapshot,
  PluginRuntimeInfo,
  SmtcHealthSnapshot,
  TaskbarStatus,
  TimelineUpdate,
  UpdateCheckResult,
  UpdateProgressEvent,
  WaveCatalogResult,
  WaveSelectionResult,
} from '../shared/lib/types'

const fallbackSnapshot: MediaSnapshot = {
  hasSession: false,
  sourceAppId: null,
  trackId: null,
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
  canLike: false,
  canDislike: false,
  isLiked: false,
  isDisliked: false,
  canShuffle: false,
  isShuffleActive: false,
  canRepeat: false,
  repeatMode: 'off',
  activeWaveId: null,
  activeWaveTitle: null,
  thumbnailDataUrl: null,
  updatedAt: new Date().toISOString(),
  provider: 'smtc',
  smtcHealth: 'healthy',
}

export async function getMediaSnapshot(): Promise<MediaSnapshot> {
  if (!isTauriRuntime()) {
    return {
      ...fallbackSnapshot,
      hasSession: true,
      sourceAppId: 'Spotify.exe',
      trackId: 'preview-track',
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
      canLike: true,
      canDislike: true,
      canShuffle: true,
      isShuffleActive: false,
      canRepeat: true,
      repeatMode: 'all',
      provider: 'yandex-direct',
      activeWaveId: 'preview_0',
      activeWaveTitle: 'Е-е-е, рок!',
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

export async function getSmtcHealth(): Promise<SmtcHealthSnapshot> {
  if (!isTauriRuntime()) {
    return {
      status: 'healthy',
      consecutiveFailures: 0,
      lastProbeMs: 0,
      lastError: null,
      sessionCount: 1,
    }
  }
  return invoke<SmtcHealthSnapshot>('get_smtc_health')
}

export async function listMediaSessions(): Promise<MediaSessionInfo[]> {
  if (!isTauriRuntime()) {
    return [{ sourceAppId: 'Spotify.exe', playbackStatus: 'playing', isCurrent: true }]
  }
  return invoke<MediaSessionInfo[]>('list_media_sessions')
}

export async function getDirectYandexStatus(): Promise<DirectYandexStatus> {
  if (!isTauriRuntime()) {
    return { state: 'disabled', message: 'Windows SMTC is active', port: null, executablePath: null }
  }
  return invoke<DirectYandexStatus>('get_direct_yandex_status')
}

export async function enableDirectYandex(): Promise<DirectYandexStatus> {
  if (!isTauriRuntime()) {
    return { state: 'connected', message: 'Preview direct connection', port: 9222, executablePath: null }
  }
  return invoke<DirectYandexStatus>('enable_direct_yandex')
}

export async function disableDirectYandex(restartPlain = true): Promise<DirectYandexStatus> {
  if (!isTauriRuntime()) {
    return { state: 'disabled', message: 'Windows SMTC is active', port: null, executablePath: null }
  }
  return invoke<DirectYandexStatus>('disable_direct_yandex', { restartPlain })
}

const previewWavePresets = [
  'Е-е-е, рок!',
  'Хочется инди',
  'Любимое',
  'Инди-поп',
  '100% музыки, 0% слов',
  'Наслаждаюсь твоей компанией',
].map((title, index) => ({
  id: `preview_${index}`,
  title,
  iconUrl: null,
  isActive: index === 0,
}))

export async function listYandexWavePresets(): Promise<WaveCatalogResult> {
  if (!isTauriRuntime()) {
    return { supported: true, presets: previewWavePresets, message: null }
  }
  return invoke<WaveCatalogResult>('list_yandex_wave_presets')
}

export async function selectYandexWavePreset(id: string): Promise<WaveSelectionResult> {
  if (!isTauriRuntime()) {
    return { supported: true, applied: true, activeWaveId: id, message: null }
  }
  return invoke<WaveSelectionResult>('select_yandex_wave_preset', { id })
}

export async function clearYandexWaveSelection(): Promise<WaveSelectionResult> {
  if (!isTauriRuntime()) {
    return { supported: true, applied: true, activeWaveId: null, message: null }
  }
  return invoke<WaveSelectionResult>('clear_yandex_wave_selection')
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

export async function previewConfig(config: AppConfig): Promise<void> {
  if (!isTauriRuntime()) {
    return
  }
  await invoke('preview_config', { config })
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

export async function onCollapsedGestureState(
  callback: (state: CollapsedGestureState) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined
  }
  return listen<CollapsedGestureState>('overlay:gesture-state', (event) => callback(event.payload))
}

export async function openSettingsWindow(): Promise<void> {
  if (!isTauriRuntime()) {
    return
  }

  await invoke('open_settings_window')
}

export async function replayIntroWindow(): Promise<void> {
  if (!isTauriRuntime()) {
    return
  }

  await invoke('replay_intro_window')
}

export async function onIntroClosed(callback: () => void): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined
  }
  return listen('intro:closed', () => callback())
}

export interface InstallHandoff {
  path: string
  version: string
}

export async function getInstallHandoff(): Promise<InstallHandoff | null> {
  if (!isTauriRuntime()) {
    return null
  }
  return invoke<InstallHandoff | null>('get_install_handoff')
}

export async function openNewerInstall(): Promise<void> {
  if (!isTauriRuntime()) {
    return
  }
  await invoke('open_newer_install')
}

export async function copyDiagnostics(): Promise<string> {
  if (!isTauriRuntime()) {
    return 'Diagnostics are available in the installed Tauri application.'
  }

  return invoke<string>('copy_diagnostics')
}

export async function checkForUpdates(forceSameVersion = false): Promise<UpdateCheckResult> {
  if (!isTauriRuntime()) {
    return {
      enabled: false,
      hasUpdate: false,
      currentVersion: 'dev',
      latestVersion: null,
      downloadUrl: null,
      releaseNotes: null,
      message: 'Updater is disabled in browser preview.',
    }
  }

  return invoke<UpdateCheckResult>('check_for_updates', { forceSameVersion })
}

export async function downloadAndInstallUpdate(forceSameVersion = false): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error('Updater is disabled in browser preview.')
  }
  await invoke('download_and_install_update', { forceSameVersion })
}

export async function onUpdaterProgress(
  callback: (event: UpdateProgressEvent) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined
  }
  return listen<UpdateProgressEvent>('updater:progress', (event) => callback(event.payload))
}

export async function onMediaUpdate(callback: (snapshot: MediaSnapshot) => void): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined
  }

  return listen<MediaSnapshot>('media:update', (event) => callback(event.payload))
}

export async function onTimelineUpdate(
  callback: (timeline: TimelineUpdate) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined
  }
  return listen<TimelineUpdate>('timeline:update', (event) => callback(event.payload))
}

export async function onSmtcHealth(
  callback: (snapshot: SmtcHealthSnapshot) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined
  }
  return listen<SmtcHealthSnapshot>('smtc:health', (event) => callback(event.payload))
}

export async function onDirectYandexStatus(
  callback: (status: DirectYandexStatus) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined
  }
  return listen<DirectYandexStatus>('direct:status', (event) => callback(event.payload))
}

export async function onConfigChanged(callback: (config: AppConfig) => void): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined
  }
  const unlistenChanged = await listen<AppConfig>('config:changed', (event) => callback(event.payload))
  const unlistenPreview = await listen<AppConfig>('config:preview', (event) => callback(event.payload))
  return () => {
    unlistenChanged()
    unlistenPreview()
  }
}

export async function onAutostartSync(callback: (event: AutostartSyncEvent) => void): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined
  }
  return listen<AutostartSyncEvent>('autostart:sync', (event) => callback(event.payload))
}

export async function onOverlayAction(action: 'open-settings', callback: () => void): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined
  }

  return listen(`overlay:${action}`, callback)
}

/** Native request to reveal the main island without opening Settings or taking focus. */
export async function onIslandReveal(callback: () => void): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined
  }

  return listen('island:reveal', () => callback())
}

export function getDefaultConfig(): AppConfig {
  return defaultConfig
}

export async function getTaskbarStatus(): Promise<TaskbarStatus> {
  if (!isTauriRuntime()) return { state: 'off' }
  return invoke<TaskbarStatus>('get_taskbar_status')
}

export async function onTaskbarStatus(callback: (status: TaskbarStatus) => void): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined
  return listen<TaskbarStatus>('taskbar:status', (event) => callback(event.payload))
}

export async function openExternalUrl(url: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs can be opened')
  }

  if (!isTauriRuntime()) {
    window.open(parsed.toString(), '_blank', 'noopener,noreferrer')
    return
  }
  await openUrl(parsed.toString())
}

/** Opens the installed Spotify client through its registered Windows URI handler. */
export async function openSpotify(): Promise<void> {
  if (!isTauriRuntime()) return
  await openUrl('spotify:')
}

function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window
}

export async function listPlugins(): Promise<PluginRuntimeInfo[]> {
  if (!isTauriRuntime()) return []
  return invoke<PluginRuntimeInfo[]>('list_plugins')
}

export async function setPluginEnabled(id: string, enabled: boolean): Promise<PluginRuntimeInfo[]> {
  if (!isTauriRuntime()) return []
  return invoke<PluginRuntimeInfo[]>('set_plugin_enabled', { id, enabled })
}

export async function pluginInvoke<T = unknown>(
  id: string,
  method: string,
  params?: unknown,
): Promise<T> {
  if (!isTauriRuntime()) {
    throw new Error('Plugins require the desktop app')
  }
  return invoke<T>('plugin_invoke', { id, method, params: params ?? null })
}

export async function onPluginsChanged(
  callback: (plugins: PluginRuntimeInfo[]) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) {
    return () => undefined
  }
  return listen<PluginRuntimeInfo[]>('plugins:changed', (event) => callback(event.payload))
}

const defaultConfig: AppConfig = {
  schemaVersion: 2,
  taskbar: { enabled: false, scale: 1, showLike: false },
  appearance: {
    theme: 'liquid-glass-dark',
    accentColor: '#F76100',
    opacity: 0.92,
    blurStrength: 28,
    cornerRadius: 30,
    reducedMotion: false,
    locale: 'ru',
  },
  layout: {
    size: 'medium',
    width: 100,
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
    hoverDelayMs: 320,
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
  media: {
    protocol: 'smtc',
    preferredSourceAppId: null,
    directYandexConsent: false,
    directYandexPort: null,
  },
  plugins: {
    enabled: [],
    settings: {},
  },
}
