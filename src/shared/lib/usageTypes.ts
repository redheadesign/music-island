export type UsageProvider = 'codex' | 'claude'

export type UsageConnectionState =
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'stale'
  | 'needs-auth'
  | 'unavailable'
  | 'error'

export type UsageMessageCode =
  | 'not-installed'
  | 'needs-auth'
  | 'offline'
  | 'timeout'
  | 'rate-limited'
  | 'no-data'
  | 'protocol-error'

export interface UsageWindow {
  id: string
  label: string
  usedPercent: number | null
  remainingPercent: number | null
  windowDurationMinutes: number | null
  /** Unix time in seconds. Null means the provider did not report a reset. */
  resetsAt: number | null
}

export interface UsageProviderSnapshot {
  provider: UsageProvider
  source: 'codex-app-server' | 'claude-oauth'
  state: UsageConnectionState
  windows: UsageWindow[]
  plan: string | null
  fetchedAt: number | null
  staleSince: number | null
  messageCode: UsageMessageCode | null
}

export interface UsageSnapshot {
  codex: UsageProviderSnapshot
  claude: UsageProviderSnapshot
}

export interface UsagePreferences {
  codexEnabled: boolean
  claudeEnabled: boolean
}

export const DEFAULT_USAGE_PREFERENCES: UsagePreferences = {
  codexEnabled: false,
  claudeEnabled: false,
}
