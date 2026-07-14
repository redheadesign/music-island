import { useCallback, useEffect, useState } from 'react'
import type { AppConfig } from '../../shared/lib/types'
import {
  getConfig,
  getDefaultConfig,
  onConfigChanged,
  saveConfig,
} from '../tauriApi'
interface AppConfigController {
  config: AppConfig
  configLoaded: boolean
  configLoadFailed: boolean
  updateConfig: (config: AppConfig) => Promise<void>
}

export function useAppConfig(_mediaEnabled: boolean): AppConfigController {
  const [config, setConfig] = useState<AppConfig>(() => getDefaultConfig())
  const [configLoaded, setConfigLoaded] = useState(false)
  const [configLoadFailed, setConfigLoadFailed] = useState(false)

  useEffect(() => {
    let mounted = true

    getConfig()
      .then((nextConfig) => {
        if (!mounted) return
        setConfig(nextConfig)
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
    let cleanup: () => void = () => undefined
    void onConfigChanged(setConfig).then((unlisten) => {
      cleanup = unlisten
    })
    return () => cleanup()
  }, [])

  const updateConfig = useCallback(async (nextConfig: AppConfig) => {
    const saved = await saveConfig(nextConfig)
    setConfig(saved)
  }, [])

  return { config, configLoaded, configLoadFailed, updateConfig }
}
