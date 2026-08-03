import { useCallback, useEffect, useState } from 'react'
import { listPlugins, onPluginsChanged, setPluginEnabled } from '../../app/tauriApi'
import type { PluginRuntimeInfo } from '../../shared/lib/types'

export function usePlugins(enabled: boolean) {
  const [plugins, setPlugins] = useState<PluginRuntimeInfo[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) return
    try {
      setPlugins(await listPlugins())
    } catch (error) {
      console.error('listPlugins failed', error)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    let cleanup: () => void = () => undefined
    void refresh()
    void onPluginsChanged((next) => setPlugins(next)).then((unlisten) => {
      cleanup = unlisten
    })
    return () => cleanup()
  }, [enabled, refresh])

  const toggleEnabled = useCallback(async (id: string, nextEnabled: boolean) => {
    setBusyId(id)
    try {
      setPlugins(await setPluginEnabled(id, nextEnabled))
    } finally {
      setBusyId(null)
    }
  }, [])

  const healthyEnabled = plugins.filter(
    (plugin) => plugin.enabled && (plugin.state === 'running' || plugin.state === 'unhealthy' || plugin.state === 'starting'),
  )

  return {
    plugins,
    healthyEnabled,
    busyId,
    refresh,
    toggleEnabled,
  }
}
