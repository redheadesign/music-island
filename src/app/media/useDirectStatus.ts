import { useCallback, useEffect, useState } from 'react'
import type { DirectYandexStatus } from '../../shared/lib/types'
import {
  enableDirectYandex,
  getDirectYandexStatus,
  onDirectYandexStatus,
} from '../tauriApi'

const RECOVERY_STATES = new Set([
  'degraded',
  'restart-required',
  'error',
  'incompatible',
])

export function useDirectStatus(enabled: boolean) {
  const [status, setStatus] = useState<DirectYandexStatus>({
    state: 'disabled',
    message: 'Windows SMTC is active',
    port: null,
    executablePath: null,
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let active = true
    let cleanup: () => void = () => undefined
    void getDirectYandexStatus().then((next) => {
      if (active) setStatus(next)
    })
    void onDirectYandexStatus((next) => {
      if (active) setStatus(next)
    }).then((unlisten) => {
      if (active) cleanup = unlisten
      else unlisten()
    })
    return () => {
      active = false
      cleanup()
    }
  }, [enabled])

  const needsRecovery = RECOVERY_STATES.has(status.state)

  const restartDirect = useCallback(async () => {
    setBusy(true)
    try {
      const next = await enableDirectYandex()
      setStatus(next)
      return next
    } finally {
      setBusy(false)
    }
  }, [])

  return {
    status,
    busy,
    needsRecovery,
    restartDirect,
  }
}
