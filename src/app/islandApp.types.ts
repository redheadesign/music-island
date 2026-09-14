import type {
  AppConfig,
  AutostartSyncEvent,
  DirectYandexStatus,
  MediaCommand,
  MediaSessionInfo,
  MediaSnapshot,
  SmtcHealthSnapshot,
  WaveContext,
  WavePreset,
} from '../shared/lib/types'

export type OverlayMode = 'idle' | 'peek' | 'compact' | 'expanded' | 'pinned' | 'settings' | 'no-session'

export interface IslandAppState {
  config: AppConfig
  media: MediaSnapshot | null
  mode: OverlayMode
  autostartError: string | null
  autostartStatus: AutostartSyncEvent | null
  progressMs: number | null
  progressPercent: number
  smtcHealth: SmtcHealthSnapshot
  mediaSessions: MediaSessionInfo[]
  waveContext: WaveContext | null
  setMode: (mode: OverlayMode) => void
  updateConfig: (config: AppConfig) => Promise<void>
  refreshMediaSessions: () => Promise<void>
  sendCommand: (command: MediaCommand) => Promise<void>
  refreshWaveContext: () => Promise<void>
  selectWavePreset: (preset: WavePreset) => Promise<void>
  clearWaveSelection: () => Promise<void>
  resetPosition: () => Promise<void>
  openSettingsWindow: () => Promise<void>
  directNeedsRecovery: boolean
  directReloadBusy: boolean
  restartDirect: () => Promise<DirectYandexStatus>
}

export interface UseIslandAppOptions {
  mediaEnabled?: boolean
  /** Media-only surfaces can skip timeline events and the progress clock. */
  timelineEnabled?: boolean
  /** Only the top island handles tray/overlay window actions. */
  windowEventsEnabled?: boolean
}
