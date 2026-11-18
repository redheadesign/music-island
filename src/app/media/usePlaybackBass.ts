import { useEffect } from 'react'
import { onPlaybackBass, setPlaybackBass } from '../tauriApi'

const SIGNAL_TIMEOUT_MS = 240
const START_RETRY_MS = 500
// The worker can be accepted before process discovery and WASAPI activation complete.
const FIRST_SAMPLE_TIMEOUT_MS = 4500

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
    let startTimer: number | undefined
    let staleTimer: number | undefined
    let unlisten: (() => void) | undefined
    let subscriptionGeneration = 0
    let subscribing = false
    let hasSample = false
    const systemQuiet = window.matchMedia('(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce), (forced-colors: active)')
    const unavailable = () => document.hidden || systemQuiet.matches

    const stop = () => {
      window.clearTimeout(startTimer)
      window.clearTimeout(staleTimer)
      if (request !== undefined) void queueCapture(request, false)
      request = undefined
      applyLevel()
    }

    const start = (mayRetry: boolean) => {
      lastRequest = (lastRequest + 1) >>> 0
      const activeRequest = lastRequest
      request = activeRequest
      hasSample = false
      void queueCapture(activeRequest, true).then((started) => {
        if (!mayRetry || hasSample || request !== activeRequest) return
        startTimer = window.setTimeout(() => {
          if (hasSample || request !== activeRequest || unavailable()) return
          stop()
          start(false)
        }, started ? FIRST_SAMPLE_TIMEOUT_MS : START_RETRY_MS)
      })
    }

    const unsubscribe = () => {
      subscriptionGeneration++
      subscribing = false
      unlisten?.()
      unlisten = undefined
      stop()
    }

    const subscribe = () => {
      if (unavailable()) {
        unsubscribe()
        return
      }
      if (subscribing || unlisten) return
      subscribing = true
      const generation = ++subscriptionGeneration
      void onPlaybackBass(({ request: sampleRequest, bass }) => {
        if (sampleRequest !== request || unavailable() || !Number.isFinite(bass)) return
        hasSample = true
        window.clearTimeout(startTimer)
        applyLevel(Math.max(0, Math.min(1, bass)))
        window.clearTimeout(staleTimer)
        staleTimer = window.setTimeout(() => applyLevel(), SIGNAL_TIMEOUT_MS)
      }).then(remove => {
        if (generation !== subscriptionGeneration) {
          remove()
          return
        }
        subscribing = false
        unlisten = remove
        start(true)
      }).catch(() => {
        if (generation === subscriptionGeneration) subscribing = false
      })
    }

    document.addEventListener('visibilitychange', subscribe)
    systemQuiet.addEventListener('change', subscribe)
    subscribe()
    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', subscribe)
      systemQuiet.removeEventListener('change', subscribe)
    }
  }, [enabled, applyLevel])
}
