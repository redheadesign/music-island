import { useEffect, useState } from 'react'
import { listenDictationEvent as listen } from './dictationEvents'
import { dictationApi } from './dictationApi'
import type { DictationStatus } from '../../shared/lib/dictationTypes'
export function useDictationAction(enabled: boolean) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    let dispose: (() => void) | undefined
    let revision = -1
    const update = (status: DictationStatus) => { if (alive && status.revision > revision) { revision = status.revision; setRecording(['recording', 'streaming', 'preparing'].includes(status.phase)) } }
    void listen<DictationStatus>('dictation:status', ({ payload }) => update(payload)).then(async (cleanup) => { if (!alive) { cleanup(); return } dispose = cleanup; update(await dictationApi.getStatus()) }).catch(() => {})
    return () => { alive = false; dispose?.() }
  }, [enabled])
  return { recording, error, toggle: async () => { setError(null); try { await dictationApi.toggle() } catch (reason) { setError(String(reason)) } } }
}
