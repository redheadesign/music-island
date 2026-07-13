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
  | { seek: { positionMs: number } }

export interface MediaSnapshot {
  hasSession: boolean
  sourceAppId: string | null
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
  thumbnailDataUrl: string | null
  updatedAt: string
  provider: 'smtc' | 'yandex-direct'
  smtcHealth: SmtcHealth
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
  state: 'disabled' | 'connecting' | 'connected' | 'incompatible' | 'error'
  message: string
  port: number | null
  executablePath: string | null
}

export type Theme = 'liquid-glass-dark' | 'soft-light' | 'ru-flow-inspired'
export type WidgetSize = 'small' | 'medium' | 'large'
export type Density = 'buttons-only' | 'minimal' | 'balanced' | 'rich'
export type LayoutPreset = 'clean-controls' | 'album-pill' | 'now-playing-rich' | 'focus-mode'

export interface AppConfig {
  schemaVersion: number
  appearance: {
    theme: Theme
    accentColor: string
    opacity: number
    blurStrength: number
    cornerRadius: number
    reducedMotion: boolean
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
  }
}

export interface UpdateCheckResult {
  enabled: boolean
  hasUpdate: boolean
  currentVersion: string
  message: string
}
