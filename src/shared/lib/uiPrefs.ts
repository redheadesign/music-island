import type { AppConfig } from './types'
import type { TaskbarLayoutV1 } from './taskbarLayout'

export const UI_PREFS_KEY = 'ui'

export type SettingsColorScheme = 'dark' | 'light'

export interface UiPrefs {
  /** Ordered controls rendered in the native taskbar player. */
  taskbarLayout?: TaskbarLayoutV1
  /** Keep quota satellites visible while the main island is collapsed. */
  usageAlwaysVisible?: boolean
  /** Independent visual scale for quota satellites. */
  usageWidgetScale?: number
  /** Render quota satellites with their compact presentation. */
  usageWidgetCompact?: boolean
  /** Explicit Settings window color scheme. Missing values keep the established dark theme. */
  settingsColorScheme?: SettingsColorScheme
  /** Settings update banner dismissed for this latest version */
  dismissedUpdateVersion?: string | null
  /** @deprecated Prefer islandUpdateSnoozedUntil — kept for migration */
  dismissedIslandUpdateVersion?: string | null
  /** ISO time until which the island nag stays hidden for islandUpdateSnoozeVersion */
  islandUpdateSnoozedUntil?: string | null
  islandUpdateSnoozeVersion?: string | null
  /** ISO time when we first saw the current pending update */
  updateFirstSeenAt?: string | null
  /** Version that updateFirstSeenAt refers to */
  updateFirstSeenVersion?: string | null
  developerMode?: boolean
  forceSettingsUpdateBanner?: boolean
  forceIslandUpdateBanner?: boolean
  forceVoiceExperimentalBanner?: boolean
  /** User dismissed the Better Voice beta notice */
  dismissedVoiceExperimentalBanner?: boolean
  /** Dev: allow download/install when latest == current */
  forceSameVersionUpdate?: boolean
  /** Post-intro hover coach finished (first successful open) */
  hoverCoachCompleted?: boolean
}

export function normalizeSettingsColorScheme(value: unknown): SettingsColorScheme {
  return value === 'light' ? 'light' : 'dark'
}

export function getSettingsColorScheme(config: AppConfig | null | undefined): SettingsColorScheme {
  return normalizeSettingsColorScheme(getUiPrefs(config).settingsColorScheme)
}

export function normalizeUsageWidgetScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.min(1.35, Math.max(0.65, value))
}

export function getUsageWidgetScale(config: AppConfig | null | undefined): number {
  return normalizeUsageWidgetScale(getUiPrefs(config).usageWidgetScale)
}

export function getUsageWidgetCompact(config: AppConfig | null | undefined): boolean {
  return getUiPrefs(config).usageWidgetCompact !== false
}

export const ISLAND_NAG_MS = 30 * 24 * 60 * 60 * 1000

export function getUiPrefs(config: AppConfig | null | undefined): UiPrefs {
  const raw = config?.plugins?.settings?.[UI_PREFS_KEY]
  if (!raw || typeof raw !== 'object') return {}
  return raw as UiPrefs
}

export function withUiPrefs(config: AppConfig, patch: Partial<UiPrefs>): AppConfig {
  const prev = getUiPrefs(config)
  return {
    ...config,
    plugins: {
      ...config.plugins,
      settings: {
        ...config.plugins.settings,
        [UI_PREFS_KEY]: { ...prev, ...patch },
      },
    },
  }
}

export function shouldShowSettingsUpdateBanner(opts: {
  hasUpdate: boolean
  latestVersion: string | null | undefined
  prefs: UiPrefs
}): boolean {
  if (opts.prefs.forceSettingsUpdateBanner) return true
  if (!opts.hasUpdate || !opts.latestVersion) return false
  return opts.prefs.dismissedUpdateVersion !== opts.latestVersion
}

export function shouldShowIslandUpdateBanner(opts: {
  hasUpdate: boolean
  latestVersion: string | null | undefined
  prefs: UiPrefs
  nowMs?: number
}): boolean {
  if (opts.prefs.forceIslandUpdateBanner) return true
  if (!opts.hasUpdate || !opts.latestVersion) return false

  const now = opts.nowMs ?? Date.now()
  const version = opts.latestVersion

  // Legacy permanent dismiss — treat as a one-month snooze from "now" is wrong;
  // migrate: if old permanent dismiss for this version, stay hidden until we clear via snooze API.
  // New rule: Later sets snoozedUntil. After expiry, show again.
  if (
    opts.prefs.islandUpdateSnoozeVersion === version
    && opts.prefs.islandUpdateSnoozedUntil
  ) {
    const until = Date.parse(opts.prefs.islandUpdateSnoozedUntil)
    if (Number.isFinite(until) && now < until) return false
  }

  const seenAt = opts.prefs.updateFirstSeenAt
  const seenVer = opts.prefs.updateFirstSeenVersion
  if (!seenAt || seenVer !== version) return false
  const age = now - Date.parse(seenAt)
  return Number.isFinite(age) && age >= ISLAND_NAG_MS
}

/** Snooze island update nag for one month (same version can return later). */
export function islandUpdateSnoozePatch(
  latestVersion: string,
  now = new Date(),
): Partial<UiPrefs> {
  return {
    islandUpdateSnoozeVersion: latestVersion,
    islandUpdateSnoozedUntil: new Date(now.getTime() + ISLAND_NAG_MS).toISOString(),
    dismissedIslandUpdateVersion: null,
    forceIslandUpdateBanner: false,
  }
}

/** Keep first-seen timestamp when a pending update appears. */
export function trackUpdateFirstSeen(
  prefs: UiPrefs,
  latestVersion: string,
  now = new Date(),
): Partial<UiPrefs> | null {
  if (
    prefs.updateFirstSeenVersion === latestVersion
    && prefs.updateFirstSeenAt
  ) {
    return null
  }
  return {
    updateFirstSeenVersion: latestVersion,
    updateFirstSeenAt: now.toISOString(),
    // New version clears snooze / legacy dismiss
    islandUpdateSnoozeVersion: null,
    islandUpdateSnoozedUntil: null,
    dismissedIslandUpdateVersion: null,
  }
}
