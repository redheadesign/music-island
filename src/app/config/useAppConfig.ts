import { useCallback, useEffect, useState } from 'react'
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
  autostartError: string | null
  autostartStatus: AutostartSyncEvent | null
  updateConfig: (config: AppConfig) => Promise<void>
}

export function useAppConfig(_mediaEnabled: boolean): AppConfigController {
  const [config, setConfig] = useState<AppConfig>(() => getDefaultConfig())
  const [configLoaded, setConfigLoaded] = useState(false)
  const [configLoadFailed, setConfigLoadFailed] = useState(false)
  const [autostartError, setAutostartError] = useState<string | null>(null)
  const [autostartStatus, setAutostartStatus] = useState<AutostartSyncEvent | null>(null)

  useEffect(() => {
    let mounted = true

    getConfig()
      .then((nextConfig) => {
        if (!mounted) return
        setConfig(withNormalizedConfig(nextConfig))
        setConfigLoaded(true)
      })
      .catch(() => {
        if (!mounted) return
        setConfig(getDefaultConfig())
        setConfigLoadFailed(true)
        setConfigLoaded(true)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let active = true
    let cleanup: () => void = () => undefined
    void onConfigChanged((next) => {
      if (active) setConfig(withNormalizedConfig(next))
    }).then((unlisten) => {
      if (active) cleanup = unlisten
      else unlisten()
    }).catch(() => undefined)
    return () => {
      active = false
      cleanup()
    }
  }, [])

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

  const updateConfig = useCallback(async (nextConfig: AppConfig) => {
    const saved = await saveConfig(withNormalizedConfig(nextConfig))
    setConfig(withNormalizedConfig(saved))
  }, [])

  return {
    config,
    configLoaded,
    configLoadFailed,
    autostartError,
    autostartStatus,
    updateConfig,
  }
}
