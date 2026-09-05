import { useCallback, useEffect, useRef, useState } from 'react'
import {
  checkForUpdates,
  downloadAndInstallUpdate,
  onUpdaterProgress,
} from '../../app/tauriApi'
import type { UpdateCheckResult, UpdateProgressEvent } from '../../shared/lib/types'

export type UpdaterUiStatus =
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'error'

export interface AppUpdaterState {
  status: UpdaterUiStatus
  result: UpdateCheckResult | null
  progress: UpdateProgressEvent | null
  error: string | null
  check: (manual?: boolean) => Promise<void>
  install: () => Promise<void>
}

export function useAppUpdater(autoCheck: boolean, forceSameVersion = false): AppUpdaterState {
  const [status, setStatus] = useState<UpdaterUiStatus>('idle')
  const [result, setResult] = useState<UpdateCheckResult | null>(null)
  const [progress, setProgress] = useState<UpdateProgressEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const checkBusyRef = useRef(false)
  const installBusyRef = useRef(false)
  const upToDateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const forceRef = useRef(forceSameVersion)
  forceRef.current = forceSameVersion

  useEffect(() => {
    let unlisten: (() => void) | undefined
    void onUpdaterProgress((event) => {
      setProgress(event)
      if (event.phase === 'downloading') setStatus('downloading')
      if (event.phase === 'installing' || event.phase === 'restarting') setStatus('installing')
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
      if (upToDateTimer.current) clearTimeout(upToDateTimer.current)
    }
  }, [])

  const check = useCallback(async (manual = false) => {
    if (checkBusyRef.current || installBusyRef.current) return
    checkBusyRef.current = true
    setError(null)
    setStatus('checking')
    if (upToDateTimer.current) {
      clearTimeout(upToDateTimer.current)
      upToDateTimer.current = null
    }
    try {
      const next = await checkForUpdates(forceRef.current)
      setResult(next)
      if (next.hasUpdate) {
        setStatus('available')
      } else if (manual) {
        setStatus('upToDate')
        upToDateTimer.current = setTimeout(() => setStatus('idle'), 3200)
      } else {
        setStatus('idle')
      }
    } catch (err) {
      setError(formatUpdaterError(err))
      // Manual check: surface error in Settings About. Auto-check: keep error text for About
      // but leave status idle so island/settings banners never treat a failed probe as an update.
      setStatus(manual ? 'error' : 'idle')
    } finally {
      checkBusyRef.current = false
    }
  }, [])

  const install = useCallback(async () => {
    if (installBusyRef.current) return
    installBusyRef.current = true
    // Don't drop Update clicks that land while the background check is still in flight.
    const started = Date.now()
    while (checkBusyRef.current && Date.now() - started < 15000) {
      await new Promise((resolve) => window.setTimeout(resolve, 40))
    }
    setError(null)
    setStatus('downloading')
    setProgress({
      phase: 'downloading',
      downloaded: 0,
      total: 0,
      percent: 0,
      message: 'Starting download…',
    })
    try {
      await downloadAndInstallUpdate(forceRef.current)
      setStatus('installing')
    } catch (err) {
      setError(formatUpdaterError(err))
      setStatus('error')
      setProgress(null)
    } finally {
      installBusyRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!autoCheck) return
    void check(false)
  }, [autoCheck, check, forceSameVersion])

  return { status, result, progress, error, check, install }
}

function formatUpdaterError(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  return String(err)
}
