import { useEffect, useRef } from 'react'
import { onPlaybackBass, setPlaybackBass } from '../tauriApi'

const SIGNAL_TIMEOUT_MS = 240
const STREAM_RETRY_MS = 1000
const START_RETRY_MS = 500
// The worker can be accepted before process discovery and WASAPI activation complete.
const FIRST_SAMPLE_TIMEOUT_MS = 4500
const MAX_RECOVERY_DELAY_MS = 12_000

let lastRequest = 0
// Keep a late start from racing the stop queued by a visibility change or Strict Mode remount.
let commandQueue: Promise<unknown> = Promise.resolve()

function queueCapture(request: number, enabled: boolean) {
  const command = commandQueue.then(() => setPlaybackBass(request, enabled)).catch(() => false)
  commandQueue = command
  return command
}

export function usePlaybackBass(enabled: boolean, applyLevel: (bass?: number) => void, trackKey: string) {
  const previouslyWorking = useRef(false)
  useEffect(() => {
    if (!enabled) return

    let request: number | undefined
    let startTimer: number | undefined
    let staleTimer: number | undefined
    let unlisten: (() => void) | undefined
    let subscriptionGeneration = 0
    let subscribing = false
    let hasSample = false
    let recoveryDelayMs = START_RETRY_MS
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
        if (hasSample || request !== activeRequest || (!mayRetry && !previouslyWorking.current)) return
        const wait = Math.max(recoveryDelayMs, started ? FIRST_SAMPLE_TIMEOUT_MS : 0)
        recoveryDelayMs = Math.min(MAX_RECOVERY_DELAY_MS, recoveryDelayMs * 2)
        startTimer = window.setTimeout(() => {
          if (hasSample || request !== activeRequest || unavailable()) return
          stop()
          start(false)
        }, wait)
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
        previouslyWorking.current = true
        recoveryDelayMs = START_RETRY_MS
        window.clearTimeout(startTimer)
        applyLevel(Math.max(0, Math.min(1, bass)))
        window.clearTimeout(staleTimer)
        staleTimer = window.setTimeout(() => {
          applyLevel()
          // Direct can suspend its process stream during seek while the UI holds Playing.
          // A healthy stream emits zeroes in silence. Only missing packets trigger recovery.
          startTimer = window.setTimeout(() => {
            if (request !== sampleRequest || unavailable()) return
            stop()
            start(true)
          }, STREAM_RETRY_MS)
        }, SIGNAL_TIMEOUT_MS)
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
  }, [enabled, applyLevel, trackKey])
}
