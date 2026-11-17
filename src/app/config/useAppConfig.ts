import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppConfig, AutostartSyncEvent } from '../../shared/lib/types'
import { normalizeLocale } from '../../shared/i18n/messages'
import {
  getConfig,
  getDefaultConfig,
  onAutostartSync,
  onConfigChanged,
  saveConfig,
} from '../tauriApi'

function withNormalizedConfig(config: AppConfig): AppConfig {
  const defaults = getDefaultConfig()
  return {
    ...config,
    taskbar: { ...defaults.taskbar, ...config.taskbar },
    appearance: {
      ...config.appearance,
      locale: normalizeLocale(config.appearance?.locale),
    },
    plugins: {
      enabled: Array.isArray(config.plugins?.enabled) ? config.plugins.enabled : defaults.plugins.enabled,
      settings: config.plugins?.settings && typeof config.plugins.settings === 'object'
        ? config.plugins.settings
        : defaults.plugins.settings,
    },
  }
}

interface AppConfigController {
  config: AppConfig
  configLoaded: boolean
  configLoadFailed: boolean
  retryConfigLoad: () => void
  autostartError: string | null
  autostartStatus: AutostartSyncEvent | null
  updateConfig: (config: AppConfig, base?: AppConfig) => Promise<void>
}

export function useAppConfig(_mediaEnabled: boolean, includePreview = true): AppConfigController {
  const [config, setConfig] = useState<AppConfig>(() => getDefaultConfig())
  const [configLoaded, setConfigLoaded] = useState(false)
  const [configLoadFailed, setConfigLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const confirmed = useRef<AppConfig | null>(null)
  const retryConfigLoad = useCallback(() => {
    setConfigLoaded(false)
    setConfigLoadFailed(false)
    setLoadAttempt(attempt => attempt + 1)
  }, [])
  const [autostartError, setAutostartError] = useState<string | null>(null)
  const [autostartStatus, setAutostartStatus] = useState<AutostartSyncEvent | null>(null)

  useEffect(() => {
    let mounted = true
    let changed = false
    let cleanup: () => void = () => undefined
    void onConfigChanged((next, preview) => {
      if (!mounted) return
      if (preview && !confirmed.current) return
      changed = true
      const normalized = withNormalizedConfig(next)
      if (!preview) {
        confirmed.current = normalized
        setConfigLoaded(true)
        setConfigLoadFailed(false)
      }
      setConfig(normalized)
    }, includePreview).then((unlisten) => {
      if (mounted) cleanup = unlisten
      else unlisten()
    }).catch(() => undefined).then(() => mounted ? getConfig() : null)
      .then((nextConfig) => {
        if (!mounted || !nextConfig) return
        if (!changed) {
          confirmed.current = withNormalizedConfig(nextConfig)
          setConfig(confirmed.current)
        }
        setConfigLoadFailed(false)
        setConfigLoaded(true)
      })
      .catch(() => {
        if (!mounted) return
        if (!changed) {
          confirmed.current = null
          setConfigLoadFailed(true)
        }
        setConfigLoaded(true)
      })

    return () => {
      mounted = false
      cleanup()
    }
  }, [loadAttempt, includePreview])

  useEffect(() => {
    let active = true
    let cleanup: () => void = () => undefined
    void onAutostartSync((event) => {
      if (!active) return
      setAutostartStatus(event)
      if (event.ok || !event.enabled) {
        setAutostartError(null)
        return
      }
      setAutostartError(event.message ?? 'Не удалось настроить автозапуск')
    }).then((unlisten) => {
      if (active) cleanup = unlisten
      else unlisten()
    }).catch(() => undefined)
    return () => {
      active = false
      cleanup()
    }
  }, [])

  const updateConfig = useCallback(async (nextConfig: AppConfig, base?: AppConfig) => {
    if (!confirmed.current) throw new Error('Settings have not been loaded')
    const saved = withNormalizedConfig(await saveConfig(withNormalizedConfig(nextConfig), base ?? confirmed.current))
    confirmed.current = saved
    setConfig(saved)
  }, [])

  return {
    config,
    configLoaded,
    configLoadFailed,
    retryConfigLoad,
    autostartError,
    autostartStatus,
    updateConfig,
  }
}
