import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { LocalServer } from '../../shared/lib/localServerTypes'

const POLL_INTERVAL_MS = 3_000
const NO_SERVERS: LocalServer[] = []

function sameServers(current: LocalServer[], next: LocalServer[]): boolean {
  return current.length === next.length && current.every((server, index) => {
    const nextServer = next[index]
    return server.id === nextServer.id
      && server.pid === nextServer.pid
      && server.host === nextServer.host
      && server.port === nextServer.port
      && server.processName === nextServer.processName
      && server.canStop === nextServer.canStop
  })
}

export interface LocalServersController {
  servers: LocalServer[]
  open: (server: LocalServer) => Promise<void>
  stop: (server: LocalServer) => Promise<void>
}

export function useLocalServersController(enabled: boolean): LocalServersController {
  const [servers, setServers] = useState(NO_SERVERS)
  const scanRevision = useRef(0)

  useEffect(() => {
    if (!enabled || !('__TAURI_INTERNALS__' in window)) {
      setServers(NO_SERVERS)
      return
    }

    let active = true
    let timer: number | undefined
    const poll = async () => {
      const revision = scanRevision.current
      const next = await invoke<LocalServer[]>('list_local_servers').catch(() => NO_SERVERS)
      if (!active) return
      if (revision === scanRevision.current) setServers((current) => sameServers(current, next) ? current : next)
      timer = window.setTimeout(poll, POLL_INTERVAL_MS)
    }
    void poll()

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [enabled])

  const open = useCallback(async (server: LocalServer) => {
    await invoke('open_local_server', { id: server.id })
  }, [])

  const stop = useCallback(async (server: LocalServer) => {
    await invoke('stop_local_server', { id: server.id })
    scanRevision.current += 1
    setServers((current) => current.filter((row) => row.pid !== server.pid))
  }, [])

  return { servers: enabled ? servers : NO_SERVERS, open, stop }
}
