import { useEffect, useRef, useState, type RefObject } from 'react'
import foxLiveWebmUrl from './assets/fox-live.webm'
import foxLiveBWebmUrl from './assets/fox-live-b.webm'
import foxLiveCWebmUrl from './assets/fox-live-c.webm'
import foxLiveDWebmUrl from './assets/fox-live-d.webm'
import foxSleepWebmUrl from './assets/fox-sleep.webm'
import foxWakeWebmUrl from './assets/fox-wake.webm'
import foxToSleepWebmUrl from './assets/fox-to-sleep.webm'
import foxLivePoster from './assets/fox-live-poster.png'
import foxSleepPoster from './assets/fox-sleep-poster.png'

type Phase = 'sleep' | 'wake' | 'live' | 'toSleep'

/**
 * Live idle pack only (sleep / wake / to-sleep stay single base clips).
 * Any new fox-*.webm MUST be built from flood-filled RGBA frames
 * (`.local/process_fox_alpha.py`) — never ffmpeg remux of opaque Magnific plates.
 * See `src/features/plugins/voice/AGENTS.md`.
 */
const LIVE_PACK = [foxLiveWebmUrl, foxLiveBWebmUrl, foxLiveCWebmUrl, foxLiveDWebmUrl] as const

/** Stable asset names for QA / developer preview comments. */
export const FOX_CLIP_CATALOG = [
  { id: 'fox-live', label: 'fox-live', group: 'live', src: foxLiveWebmUrl },
  { id: 'fox-live-b', label: 'fox-live-b', group: 'live', src: foxLiveBWebmUrl },
  { id: 'fox-live-c', label: 'fox-live-c', group: 'live', src: foxLiveCWebmUrl },
  { id: 'fox-live-d', label: 'fox-live-d', group: 'live', src: foxLiveDWebmUrl },
  { id: 'fox-sleep', label: 'fox-sleep', group: 'sleep', src: foxSleepWebmUrl },
  { id: 'fox-wake', label: 'fox-wake', group: 'transition', src: foxWakeWebmUrl },
  { id: 'fox-to-sleep', label: 'fox-to-sleep', group: 'transition', src: foxToSleepWebmUrl },
] as const

export type FoxClipId = (typeof FOX_CLIP_CATALOG)[number]['id']

function clipById(id: string | null | undefined) {
  if (!id) return null
  return FOX_CLIP_CATALOG.find((clip) => clip.id === id) ?? null
}

/** Mulberry32 — small seeded PRNG for pack picks. */
function createSeededRng(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function newSessionSeed(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return buf[0] || 1
  }
  return (Date.now() ^ (Math.random() * 0x100000000)) >>> 0 || 1
}

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

/** Finish the current playthrough (disable loop), then resolve. Aborts early when `isCurrent` flips. */
function waitUntilClipEnds(
  video: HTMLVideoElement,
  isCurrent: () => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    if (!isCurrent()) {
      resolve()
      return
    }
    const finish = () => {
      window.clearInterval(poll)
      video.removeEventListener('ended', onEnded)
      resolve()
    }
    const onEnded = () => finish()
    const poll = window.setInterval(() => {
      if (!isCurrent()) finish()
    }, 40)

    video.loop = false
    if (video.ended) {
      finish()
      return
    }
    video.addEventListener('ended', onEnded)
    void video.play().catch(() => {})
  })
}

function pauseAll(refs: Array<RefObject<HTMLVideoElement | null>>) {
  for (const ref of refs) {
    try {
      ref.current?.pause()
    } catch {
      /* ignore */
    }
  }
}

/**
 * Sleep/live loops + one-shot wake & fall-asleep.
 * Live idle pack uses seeded random (no immediate repeat); sleep is a single loop.
 * Start/Stop always finish the current clip before transitioning — never hard-cut mid-loop.
 *
 * Leaving the tab (`active=false`) cancels in-flight wake/toSleep and snaps to the
 * real target. Re-entering starts that actual loop immediately.
 */
export function VoiceFoxVideoMascot({
  live,
  active = true,
  /** Developer QA: loop one named clip forever; `null` = normal pack/transition logic. */
  previewClipId = null,
}: {
  live: boolean
  active?: boolean
  previewClipId?: FoxClipId | null
}) {
  const sleepRef = useRef<HTMLVideoElement>(null)
  const liveRef = useRef<HTMLVideoElement>(null)
  const wakeRef = useRef<HTMLVideoElement>(null)
  const toSleepRef = useRef<HTMLVideoElement>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const allRefs = [sleepRef, liveRef, wakeRef, toSleepRef, previewRef]
  const phaseRef = useRef<Phase>(live ? 'live' : 'sleep')
  const wantLiveRef = useRef(live)
  const activeRef = useRef(active)
  const previewClip = clipById(previewClipId)
  const previewing = Boolean(previewClip)
  /** Bumps to invalidate in-flight transition chains (tab leave / snap). */
  const chainGenRef = useRef(0)
  const chainRef = useRef(Promise.resolve())
  const rngRef = useRef(createSeededRng(newSessionSeed()))
  const lastLiveIdxRef = useRef(-1)
  const liveCycleActiveRef = useRef(false)
  const sleepCycleActiveRef = useRef(false)
  const [phase, setPhase] = useState<Phase>(() => (live ? 'live' : 'sleep'))
  const [liveSrc, setLiveSrc] = useState<string>(LIVE_PACK[0])
  /** Bumps even when the next pack URL equals the current one, so playback restarts. */
  const [liveGen, setLiveGen] = useState(0)
  const [sleepGen, setSleepGen] = useState(0)

  const isChainCurrent = (gen: number) =>
    activeRef.current && chainGenRef.current === gen

  const go = (next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }

  const pickPackIndex = (packLen: number, lastIdx: number): number => {
    if (packLen <= 1) return 0
    let next = Math.floor(rngRef.current() * packLen)
    if (next === lastIdx) {
      next = (next + 1 + Math.floor(rngRef.current() * (packLen - 1))) % packLen
    }
    return next
  }

  const startLiveCycle = () => {
    if (!activeRef.current || previewing) return
    liveCycleActiveRef.current = true
    sleepCycleActiveRef.current = false
    const idx = pickPackIndex(LIVE_PACK.length, lastLiveIdxRef.current)
    lastLiveIdxRef.current = idx
    setLiveSrc(LIVE_PACK[idx])
    setLiveGen((value) => value + 1)
  }

  const startSleepCycle = () => {
    if (!activeRef.current || previewing) return
    sleepCycleActiveRef.current = true
    liveCycleActiveRef.current = false
    setSleepGen((value) => value + 1)
  }

  /** Jump to the real idle/live loop — no wake / to-sleep. */
  const snapToActual = (wantLive: boolean) => {
    chainGenRef.current += 1
    liveCycleActiveRef.current = false
    sleepCycleActiveRef.current = false
    pauseAll(allRefs)
    chainRef.current = Promise.resolve()

    if (wantLive) {
      go('live')
      startLiveCycle()
      return
    }
    go('sleep')
    startSleepCycle()
  }

  // Developer preview: infinite loop of one named clip; suspends pack/transition logic.
  useEffect(() => {
    if (!previewClip) return
    chainGenRef.current += 1
    liveCycleActiveRef.current = false
    sleepCycleActiveRef.current = false
    chainRef.current = Promise.resolve()
    pauseAll([sleepRef, liveRef, wakeRef, toSleepRef])

    const el = previewRef.current
    if (!el || !active) {
      previewRef.current?.pause()
      return
    }
    el.loop = true
    playFromStart(el)
    return () => {
      try {
        el.pause()
      } catch {
        /* ignore */
      }
    }
  }, [previewClip, previewClip?.src, active])

  // Leaving preview restores normal playback for the current engine state.
  useEffect(() => {
    if (previewClip) return
    if (!activeRef.current) return
    snapToActual(wantLiveRef.current)
  }, [previewClipId])

  // Seed the correct loop without a wake flash when Better Voice is already running.
  useEffect(() => {
    if (previewClip) return
    snapToActual(live)
  }, [])

  // Pause on leave; on return always start the actual loop (skip unfinished transitions).
  useEffect(() => {
    activeRef.current = active
    if (!active) {
      chainGenRef.current += 1
      liveCycleActiveRef.current = false
      sleepCycleActiveRef.current = false
      pauseAll(allRefs)
      if (!previewClip) go(wantLiveRef.current ? 'live' : 'sleep')
      return
    }
    if (previewClip) return
    snapToActual(wantLiveRef.current)
  }, [active])

  // Drive live playback from React src changes so load + play stay in sync.
  useEffect(() => {
    if (previewing || !active || phase !== 'live' || !liveCycleActiveRef.current) return
    const liveEl = liveRef.current
    if (!liveEl) return

    let cancelled = false
    liveEl.loop = false

    const playWhenReady = () => {
      if (cancelled || !activeRef.current || !liveCycleActiveRef.current || phaseRef.current !== 'live') return
      if (!wantLiveRef.current) return
      try {
        liveEl.currentTime = 0
      } catch {
        /* ignore */
      }
      void liveEl.play().catch(() => {})
    }

    if (liveEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      playWhenReady()
    } else {
      liveEl.addEventListener('loadeddata', playWhenReady, { once: true })
    }

    const onEnded = () => {
      if (cancelled || !activeRef.current || !liveCycleActiveRef.current || phaseRef.current !== 'live') return
      if (!wantLiveRef.current) return
      startLiveCycle()
    }
    liveEl.addEventListener('ended', onEnded)

    return () => {
      cancelled = true
      liveEl.removeEventListener('loadeddata', playWhenReady)
      liveEl.removeEventListener('ended', onEnded)
    }
  }, [liveSrc, liveGen, phase, active, previewing])

  // Single sleep loop (restart via sleepGen so Start/Stop can still wait for clip end).
  useEffect(() => {
    if (previewing || !active || phase !== 'sleep' || !sleepCycleActiveRef.current) return
    const sleepEl = sleepRef.current
    if (!sleepEl) return

    let cancelled = false
    sleepEl.loop = false

    const playWhenReady = () => {
      if (cancelled || !activeRef.current || !sleepCycleActiveRef.current || phaseRef.current !== 'sleep') return
      if (wantLiveRef.current) return
      try {
        sleepEl.currentTime = 0
      } catch {
        /* ignore */
      }
      void sleepEl.play().catch(() => {})
    }

    if (sleepEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      playWhenReady()
    } else {
      sleepEl.addEventListener('loadeddata', playWhenReady, { once: true })
    }

    const onEnded = () => {
      if (cancelled || !activeRef.current || !sleepCycleActiveRef.current || phaseRef.current !== 'sleep') return
      if (wantLiveRef.current) return
      startSleepCycle()
    }
    sleepEl.addEventListener('ended', onEnded)

    return () => {
      cancelled = true
      sleepEl.removeEventListener('loadeddata', playWhenReady)
      sleepEl.removeEventListener('ended', onEnded)
    }
  }, [sleepGen, phase, active, previewing])

  // Transitions only while the tab stays visible. Leaving cancels the chain via chainGen.
  // Start/Stop always finish the current clip first — never hard-cut mid-loop.
  useEffect(() => {
    wantLiveRef.current = live
    if (previewing) return
    if (!activeRef.current) {
      go(live ? 'live' : 'sleep')
      return
    }

    const gen = ++chainGenRef.current
    const current = () => isChainCurrent(gen)

    chainRef.current = chainRef.current.then(async () => {
      if (!current()) return

      const want = wantLiveRef.current
      const cur = phaseRef.current

      if (want && cur === 'live') return
      if (!want && cur === 'sleep') return
      if (want && cur === 'wake') return
      if (!want && cur === 'toSleep') return

      if (want) {
        if (cur === 'sleep') {
          const sleep = sleepRef.current
          if (sleep) await waitUntilClipEnds(sleep, current)
        } else if (cur === 'toSleep') {
          const toSleep = toSleepRef.current
          if (toSleep && !toSleep.ended) await waitUntilClipEnds(toSleep, current)
        } else if (cur === 'live') {
          return
        }

        if (!current() || !wantLiveRef.current) return

        sleepCycleActiveRef.current = false
        go('wake')
        const wake = wakeRef.current
        if (wake) {
          wake.loop = false
          playFromStart(wake)
          await waitUntilClipEnds(wake, current)
        }

        if (!current()) return

        if (!wantLiveRef.current) {
          liveCycleActiveRef.current = false
          go('toSleep')
          const toSleep = toSleepRef.current
          if (toSleep) {
            toSleep.loop = false
            playFromStart(toSleep)
            await waitUntilClipEnds(toSleep, current)
          }
          if (!current()) return
          go('sleep')
          startSleepCycle()
          return
        }

        go('live')
        startLiveCycle()
        return
      }

      liveCycleActiveRef.current = false

      if (cur === 'live') {
        const liveEl = liveRef.current
        if (liveEl) await waitUntilClipEnds(liveEl, current)
      } else if (cur === 'wake') {
        const wake = wakeRef.current
        if (wake && !wake.ended) await waitUntilClipEnds(wake, current)
      } else if (cur === 'sleep') {
        return
      }

      if (!current() || wantLiveRef.current) return

      go('toSleep')
      const toSleep = toSleepRef.current
      if (toSleep) {
        toSleep.loop = false
        playFromStart(toSleep)
        await waitUntilClipEnds(toSleep, current)
      }

      if (!current()) return

      if (wantLiveRef.current) {
        go('wake')
        const wake = wakeRef.current
        if (wake) {
          wake.loop = false
          playFromStart(wake)
          await waitUntilClipEnds(wake, current)
        }
        if (!current()) return
        go('live')
        startLiveCycle()
        return
      }

      go('sleep')
      startSleepCycle()
    })
  }, [live, previewing])

  const showPreview = Boolean(previewClip)

  return (
    <div
      className={[
        'voice-fox',
        'voice-fox--video',
        showPreview
          || phase === 'live'
          || phase === 'wake'
          ? 'voice-fox--live'
          : 'voice-fox--sleep',
      ].join(' ')}
      aria-hidden
    >
      <div className="voice-fox__stage">
        <div className="voice-fox__figure">
          <video
            ref={sleepRef}
            className={['voice-fox__video', !showPreview && phase === 'sleep' ? 'voice-fox__video--active' : ''].join(' ')}
            src={foxSleepWebmUrl}
            poster={foxSleepPoster}
            muted
            playsInline
            preload={active && !showPreview ? 'auto' : 'metadata'}
          />
          <video
            ref={wakeRef}
            className={['voice-fox__video', !showPreview && phase === 'wake' ? 'voice-fox__video--active' : ''].join(' ')}
            src={foxWakeWebmUrl}
            muted
            playsInline
            preload={active && !showPreview ? 'auto' : 'metadata'}
          />
          <video
            ref={liveRef}
            className={['voice-fox__video', !showPreview && phase === 'live' ? 'voice-fox__video--active' : ''].join(' ')}
            src={liveSrc}
            poster={foxLivePoster}
            muted
            playsInline
            preload={active && !showPreview ? 'auto' : 'metadata'}
          />
          <video
            ref={toSleepRef}
            className={['voice-fox__video', !showPreview && phase === 'toSleep' ? 'voice-fox__video--active' : ''].join(' ')}
            src={foxToSleepWebmUrl}
            muted
            playsInline
            preload={active && !showPreview ? 'auto' : 'metadata'}
          />
          <video
            ref={previewRef}
            className={['voice-fox__video', showPreview ? 'voice-fox__video--active' : ''].join(' ')}
            src={previewClip?.src}
            muted
            playsInline
            loop
            preload={showPreview && active ? 'auto' : 'metadata'}
          />
        </div>
      </div>
    </div>
  )
}
