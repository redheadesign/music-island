import { useEffect } from 'react'
import { onPlaybackBass, setPlaybackBass } from '../tauriApi'

const SIGNAL_TIMEOUT_MS = 240
const START_RETRY_MS = 500

let lastRequest = 0
// Keep a late start from racing the stop queued by a visibility change or Strict Mode remount.
let commandQueue: Promise<unknown> = Promise.resolve()

function queueCapture(request: number, enabled: boolean) {
  const command = commandQueue.then(() => setPlaybackBass(request, enabled)).catch(() => false)
  commandQueue = command
  return command
}

export function usePlaybackBass(enabled: boolean, applyLevel: (bass?: number) => void) {
  useEffect(() => {
    if (!enabled) return

    let request: number | undefined
    let retryTimer: number | undefined
    let staleTimer: number | undefined
    let unlisten: (() => void) | undefined
    let disposed = false

    const stop = () => {
      window.clearTimeout(retryTimer)
      window.clearTimeout(staleTimer)
      if (request !== undefined) void queueCapture(request, false)
      request = undefined
      applyLevel()
    }

    const syncVisibility = () => {
      if (document.hidden) {
        stop()
        return
      }
      if (!unlisten || request !== undefined) return

      lastRequest = (lastRequest + 1) >>> 0
      const activeRequest = lastRequest
      request = activeRequest
      void queueCapture(activeRequest, true).then((started) => {
        if (started || request !== activeRequest) return
        // Settings preview updates before its debounced native save; retry the persisted preference once.
        retryTimer = window.setTimeout(() => {
          if (request === activeRequest) void queueCapture(activeRequest, true)
        }, START_RETRY_MS)
      })
    }

    document.addEventListener('visibilitychange', syncVisibility)
    void onPlaybackBass(({ request: sampleRequest, bass }) => {
      if (sampleRequest !== request || document.hidden || !Number.isFinite(bass)) return
      applyLevel(Math.max(0, Math.min(1, bass)))
      window.clearTimeout(staleTimer)
      staleTimer = window.setTimeout(() => applyLevel(), SIGNAL_TIMEOUT_MS)
    }).then((remove) => {
      if (disposed) {
        remove()
        return
      }
      unlisten = remove
      syncVisibility()
    }).catch(() => undefined)

    return () => {
      disposed = true
      stop()
      unlisten?.()
      document.removeEventListener('visibilitychange', syncVisibility)
    }
  }, [enabled, applyLevel])
}
