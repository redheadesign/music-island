import { useEffect, useState } from 'react'
import type { LatestDictationMessage } from '../../shared/lib/dictationTypes'
import { dictationApi } from './dictationApi'
import { listenDictationEvent } from './dictationEvents'

export interface LatestDictationMessageController {
  message: LatestDictationMessage | null
  copy: (id: number) => Promise<void>
}

export function useLatestDictationMessage(enabled: boolean): LatestDictationMessageController {
  const [message, setMessage] = useState<LatestDictationMessage | null>(null)
  useEffect(() => {
    if (!enabled || !('__TAURI_INTERNALS__' in window)) {
      setMessage(null)
      return
    }
    let alive = true
    let stop: (() => void) | undefined
    let reading = false
    let pending = false
    const read = async () => {
      pending = true
      if (reading || !alive) return
      reading = true
      while (alive && pending) {
        pending = false
        const next = await dictationApi.getLatestHistoryMessage().catch(() => null)
        if (alive && !pending) setMessage(next)
      }
      reading = false
    }
    void listenDictationEvent<{ action: string }>('history-update-payload', ({ payload }) => {
      if (payload.action !== 'toggled') void read()
    }).then((unsubscribe) => {
      if (!alive) { unsubscribe(); return }
      stop = unsubscribe
      void read()
    }).catch(() => { if (alive) void read() })
    return () => { alive = false; stop?.() }
  }, [enabled])
  return { message: enabled ? message : null, copy: dictationApi.copyHistoryMessage }
}
