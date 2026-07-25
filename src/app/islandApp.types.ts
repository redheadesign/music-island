import type {
  AppConfig,
  AutostartSyncEvent,
  DirectYandexStatus,
  MediaCommand,
  MediaSessionInfo,
  MediaSnapshot,
  SmtcHealthSnapshot,
  UpdateCheckResult,
  WaveContext,
  WavePreset,
} from '../shared/lib/types'

export type OverlayMode = 'idle' | 'peek' | 'compact' | 'expanded' | 'pinned' | 'settings' | 'no-session'

export interface IslandAppState {
  config: AppConfig
  media: MediaSnapshot | null
  mode: OverlayMode
  updateMessage: string | null
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
  checkUpdates: () => Promise<UpdateCheckResult>
  directNeedsRecovery: boolean
  directReloadBusy: boolean
  restartDirect: () => Promise<DirectYandexStatus>
}

export interface UseIslandAppOptions {
  mediaEnabled?: boolean
}
