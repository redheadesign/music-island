import type { AppConfig } from '../../shared/lib/types'
import {
  DEFAULT_USAGE_PREFERENCES,
  type UsagePreferences,
  type UsageProvider,
} from '../../shared/lib/usageTypes'

export function getUsagePreferences(config: AppConfig): UsagePreferences {
  const value = config.plugins.settings.usage
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_USAGE_PREFERENCES
  }
  const record = value as Record<string, unknown>
  return {
    codexEnabled: record.codexEnabled === true,
    claudeEnabled: record.claudeEnabled === true,
  }
}

export function withUsageProviderEnabled(
  config: AppConfig,
  provider: UsageProvider,
  enabled: boolean,
): AppConfig {
  const preferences = getUsagePreferences(config)
  return {
    ...config,
    plugins: {
      ...config.plugins,
      settings: {
        ...config.plugins.settings,
        usage: {
          ...preferences,
          [`${provider}Enabled`]: enabled,
        },
      },
    },
  }
}

export function enabledUsageProviders(config: AppConfig): UsageProvider[] {
  const preferences = getUsagePreferences(config)
  return (['codex', 'claude'] as const).filter(
    (provider) => preferences[`${provider}Enabled`],
  )
}
