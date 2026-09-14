import { useCallback, useEffect, useRef, useState } from 'react'
import type { UsageProvider, UsageSnapshot } from '../../shared/lib/usageTypes'
import {
  connectUsageProvider,
  disconnectUsageProvider,
  getUsageSnapshot,
  onUsageSnapshot,
  refreshUsageProvider,
} from './usageApi'

export interface UsageController {
  snapshot: UsageSnapshot | null
  busyProvider: UsageProvider | null
  connect: (provider: UsageProvider) => Promise<UsageSnapshot>
  disconnect: (provider: UsageProvider) => Promise<UsageSnapshot>
  refresh: (provider: UsageProvider) => Promise<UsageSnapshot>
}

/** Observes the native shared cache. Config lifecycle synchronization belongs to one app owner. */
export function useUsageController(enabled = true): UsageController {
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null)
  const [busyProvider, setBusyProvider] = useState<UsageProvider | null>(null)
  const snapshotRevisionRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    let active = true
    let unlisten: () => void = () => undefined
    const bootstrap = async () => {
      try {
        const cleanup = await onUsageSnapshot((next) => {
          if (active) {
            snapshotRevisionRef.current += 1
            setSnapshot(next)
          }
        })
        if (!active) {
          cleanup()
          return
        }
        unlisten = cleanup
      } catch {
        // A cache read still gives the window a usable snapshot when event setup fails.
        if (!active) return
      }

      const initialRevision = snapshotRevisionRef.current
      try {
        const next = await getUsageSnapshot()
        if (active && snapshotRevisionRef.current === initialRevision) setSnapshot(next)
      } catch {
        // Native events can still populate the controller after a failed cache read.
      }
    }
    void bootstrap()
    return () => {
      active = false
      unlisten()
    }
  }, [enabled])

  const run = useCallback(async (
    provider: UsageProvider,
    action: (provider: UsageProvider) => Promise<UsageSnapshot>,
  ) => {
    setBusyProvider(provider)
    try {
      const next = await action(provider)
      snapshotRevisionRef.current += 1
      setSnapshot(next)
      return next
    } finally {
      setBusyProvider((current) => current === provider ? null : current)
    }
  }, [])

  return {
    snapshot,
    busyProvider,
    connect: useCallback((provider) => run(provider, connectUsageProvider), [run]),
    disconnect: useCallback((provider) => run(provider, disconnectUsageProvider), [run]),
    refresh: useCallback((provider) => run(provider, refreshUsageProvider), [run]),
  }
}
