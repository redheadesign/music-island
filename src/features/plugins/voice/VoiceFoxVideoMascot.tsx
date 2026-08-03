import { useEffect, useRef, useState } from 'react'
import foxLiveWebmUrl from './assets/fox-live.webm'
import foxSleepWebmUrl from './assets/fox-sleep.webm'
import foxWakeWebmUrl from './assets/fox-wake.webm'
import foxToSleepWebmUrl from './assets/fox-to-sleep.webm'
import foxLivePoster from './assets/fox-live-poster.png'
import foxSleepPoster from './assets/fox-sleep-poster.png'

type Phase = 'sleep' | 'wake' | 'live' | 'toSleep'

function playFromStart(video: HTMLVideoElement | null) {
  if (!video) return
  try {
    video.pause()
    video.currentTime = 0
  } catch {
    /* ignore seek errors before metadata */
  }
  void video.play().catch(() => {})
}

/** Finish the current playthrough (disable loop), then resolve. */
function waitUntilClipEnds(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener('ended', done)
      resolve()
    }
    video.loop = false
    if (video.ended) {
      done()
      return
    }
    video.addEventListener('ended', done)
    void video.play().catch(() => {})
  })
}

/**
 * Sleep/live loops + one-shot wake & fall-asleep.
 * Start/Stop waits for the current loop to finish, plays transition, then target loop.
 */
export function VoiceFoxVideoMascot({ live }: { live: boolean }) {
  const sleepRef = useRef<HTMLVideoElement>(null)
  const liveRef = useRef<HTMLVideoElement>(null)
  const wakeRef = useRef<HTMLVideoElement>(null)
  const toSleepRef = useRef<HTMLVideoElement>(null)
  const phaseRef = useRef<Phase>('sleep')
  const wantLiveRef = useRef(live)
  const chainRef = useRef(Promise.resolve())
  const [phase, setPhase] = useState<Phase>('sleep')

  const go = (next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }

  useEffect(() => {
    const sleep = sleepRef.current
    if (!sleep) return
    sleep.loop = true
    playFromStart(sleep)
  }, [])

  useEffect(() => {
    wantLiveRef.current = live

    chainRef.current = chainRef.current.then(async () => {
      const want = wantLiveRef.current
      const cur = phaseRef.current

      if (want && cur === 'live') return
      if (!want && cur === 'sleep') return
      if (want && cur === 'wake') return
      if (!want && cur === 'toSleep') return

      // Already heading the right way mid-transition is handled by re-check after each step.

      if (want) {
        // → awake: finish sleep loop → wake → live
        if (cur === 'sleep') {
          const sleep = sleepRef.current
          if (sleep) await waitUntilClipEnds(sleep)
        } else if (cur === 'toSleep') {
          const toSleep = toSleepRef.current
          if (toSleep && !toSleep.ended) await waitUntilClipEnds(toSleep)
        } else if (cur === 'live') {
          return
        }

        if (!wantLiveRef.current) return

        go('wake')
        const wake = wakeRef.current
        if (wake) {
          wake.loop = false
          playFromStart(wake)
          await waitUntilClipEnds(wake)
        }

        if (!wantLiveRef.current) {
          go('toSleep')
          const toSleep = toSleepRef.current
          if (toSleep) {
            toSleep.loop = false
            playFromStart(toSleep)
            await waitUntilClipEnds(toSleep)
          }
          go('sleep')
          const sleep = sleepRef.current
          if (sleep) {
            sleep.loop = true
            playFromStart(sleep)
          }
          return
        }

        go('live')
        const liveEl = liveRef.current
        if (liveEl) {
          liveEl.loop = true
          playFromStart(liveEl)
        }
        return
      }

      // → sleep: finish live loop → toSleep → sleep
      if (cur === 'live') {
        const liveEl = liveRef.current
        if (liveEl) await waitUntilClipEnds(liveEl)
      } else if (cur === 'wake') {
        const wake = wakeRef.current
        if (wake && !wake.ended) await waitUntilClipEnds(wake)
      } else if (cur === 'sleep') {
        return
      }

      if (wantLiveRef.current) return

      go('toSleep')
      const toSleep = toSleepRef.current
      if (toSleep) {
        toSleep.loop = false
        playFromStart(toSleep)
        await waitUntilClipEnds(toSleep)
      }

      if (wantLiveRef.current) {
        go('wake')
        const wake = wakeRef.current
        if (wake) {
          wake.loop = false
          playFromStart(wake)
          await waitUntilClipEnds(wake)
        }
        go('live')
        const liveEl = liveRef.current
        if (liveEl) {
          liveEl.loop = true
          playFromStart(liveEl)
        }
        return
      }

      go('sleep')
      const sleep = sleepRef.current
      if (sleep) {
        sleep.loop = true
        playFromStart(sleep)
      }
    })
  }, [live])

  return (
    <div
      className={[
        'voice-fox',
        'voice-fox--video',
        phase === 'live' || phase === 'wake' ? 'voice-fox--live' : 'voice-fox--sleep',
      ].join(' ')}
      aria-hidden
    >
      <div className="voice-fox__stage">
        <div className="voice-fox__figure">
          <video
            ref={sleepRef}
            className={['voice-fox__video', phase === 'sleep' ? 'voice-fox__video--active' : ''].join(' ')}
            src={foxSleepWebmUrl}
            poster={foxSleepPoster}
            muted
            playsInline
            loop
            preload="auto"
          />
          <video
            ref={wakeRef}
            className={['voice-fox__video', phase === 'wake' ? 'voice-fox__video--active' : ''].join(' ')}
            src={foxWakeWebmUrl}
            muted
            playsInline
            preload="auto"
          />
          <video
            ref={liveRef}
            className={['voice-fox__video', phase === 'live' ? 'voice-fox__video--active' : ''].join(' ')}
            src={foxLiveWebmUrl}
            poster={foxLivePoster}
            muted
            playsInline
            loop
            preload="auto"
          />
          <video
            ref={toSleepRef}
            className={['voice-fox__video', phase === 'toSleep' ? 'voice-fox__video--active' : ''].join(' ')}
            src={foxToSleepWebmUrl}
            muted
            playsInline
            preload="auto"
          />
        </div>
      </div>
    </div>
  )
}
