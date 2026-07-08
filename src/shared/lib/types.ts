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
  thumbnailDataUrl: string | null
  updatedAt: string
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
}

export interface UpdateCheckResult {
  enabled: boolean
  hasUpdate: boolean
  currentVersion: string
  message: string
}
