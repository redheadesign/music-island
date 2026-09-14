export type PlaybackStatus =
  | 'no-session'
  | 'closed'
  | 'opened'
  | 'changing'
  | 'stopped'
  | 'playing'
  | 'paused'
  | 'unknown'

export type MediaCommand =
  | 'play'
  | 'pause'
  | 'play-pause'
  | 'next'
  | 'previous'
  | 'stop'
  | 'like'
  | 'dislike'
  | 'toggle-shuffle'
  | 'cycle-repeat'
  | { seek: { positionMs: number } }

export type RepeatMode = 'off' | 'all' | 'one'

export interface WaveSelection {
  id: string
  label: string
  iconUrl: string | null
  removable: boolean
}

export interface WavePreset {
  id: string
  title: string
  iconUrl: string | null
  isActive: boolean
}

export interface WaveContext {
  isMyWave: boolean
  active: WaveSelection | null
  presets: WavePreset[]
  supported: boolean
}

export interface WaveCatalogResult {
  supported: boolean
  presets: WavePreset[]
  message: string | null
}

export interface WaveSelectionResult {
  supported: boolean
  applied: boolean
  activeWaveId: string | null
  message: string | null
}

export interface MediaSnapshot {
  hasSession: boolean
  sourceAppId: string | null
  trackId: string | null
  title: string | null
  artist: string | null
  albumTitle: string | null
  playbackStatus: PlaybackStatus
  positionMs: number | null
  durationMs: number | null
  canSeek: boolean
  canGoNext: boolean
  canGoPrevious: boolean
  canPlay: boolean
  canPause: boolean
  canLike: boolean
  canDislike: boolean
  isLiked: boolean
  isDisliked: boolean
  canShuffle: boolean
  isShuffleActive: boolean
  canRepeat: boolean
  repeatMode: RepeatMode
  activeWaveId: string | null
  activeWaveTitle: string | null
  thumbnailDataUrl: string | null
  updatedAt: string
  provider: 'smtc' | 'yandex-direct'
  smtcHealth: SmtcHealth
}

export interface TimelineUpdate {
  positionMs: number | null
  durationMs: number | null
  playbackStatus: PlaybackStatus
  updatedAt: string
  provider: 'smtc' | 'yandex-direct'
}

export type SmtcHealth = 'healthy' | 'degraded' | 'unavailable'

export interface SmtcHealthSnapshot {
  status: SmtcHealth
  consecutiveFailures: number
  lastProbeMs: number
  lastError: string | null
  sessionCount: number
}

export interface MediaSessionInfo {
  sourceAppId: string
  playbackStatus: PlaybackStatus
  isCurrent: boolean
}

export interface DirectYandexStatus {
  state: 'disabled' | 'connecting' | 'connected' | 'degraded' | 'restart-required' | 'incompatible' | 'error'
  message: string
  port: number | null
  executablePath: string | null
}

export type Theme = 'liquid-glass-dark' | 'soft-light' | 'ru-flow-inspired'
export type Locale = 'ru' | 'en'
export type WidgetSize = 'small' | 'medium' | 'large'
export type Density = 'buttons-only' | 'minimal' | 'balanced' | 'rich'
export type LayoutPreset = 'clean-controls' | 'album-pill' | 'now-playing-rich' | 'focus-mode'

export interface TaskbarStatus {
  state: 'off' | 'visible' | 'hidden' | 'no-space' | 'unsupported' | 'error'
}

export interface AppConfig {
  schemaVersion: number
  taskbar: {
    enabled: boolean
    scale?: number
    showLike?: boolean
  }
  appearance: {
    theme: Theme
    accentColor: string
    opacity: number
    blurStrength: number
    cornerRadius: number
    reducedMotion: boolean
    locale: Locale
  }
  layout: {
    size: WidgetSize
    width: number
    scale: number
    density: Density
    showArtwork: boolean
    showTitle: boolean
    showArtist: boolean
    showProgress: boolean
    showSource: boolean
    showPreviousNext: boolean
    preset: LayoutPreset
  }
  behavior: {
    hoverDelayMs: number
    autoCollapseMs: number
    pinExpanded: boolean
    alwaysOnTop: boolean
    launchAtStartup: boolean
    hideOverFullscreen: boolean
    monitorId: string | null
  }
  modules: {
    activeModule: string
    enabledModules: string[]
  }
  privacy: {
    telemetryEnabled: boolean
    writeDetailedLogs: boolean
  }
  media: {
    protocol: 'smtc' | 'yandex-direct'
    preferredSourceAppId: string | null
    directYandexConsent: boolean
    directYandexPort: number | null
  }
  plugins: {
    enabled: string[]
    settings: Record<string, unknown>
  }
}

export type PluginRuntimeState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'unhealthy'
  | 'missing'
  | 'error'

export interface PluginRuntimeInfo {
  id: string
  name: string
  version: string
  icon: string | null
  enabled: boolean
  state: PluginRuntimeState
  message: string
  rootDir: string
  entryPath: string
  source: string
  railActions: string[]
  settingsPanel: string | null
  logPath: string
}

export interface UpdateCheckResult {
  enabled: boolean
  hasUpdate: boolean
  currentVersion: string
  latestVersion?: string | null
  downloadUrl?: string | null
  releaseNotes?: string | null
  message: string
}

export interface UpdateProgressEvent {
  phase: string
  downloaded: number
  total: number
  percent: number
  message: string
}

export interface AutostartSyncEvent {
  ok: boolean
  message: string | null
  enabled: boolean
  exePath: string | null
  command: string | null
}
