import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { StaticRadialGradient } from '@paper-design/shaders-react'
import { useEffect, useRef } from 'react'
import { AppLogo } from '../../shared/ui/AppLogo'
import './IntroSplash.css'

/** Brand splash tones derived from #F76100 */
const EDGE_COLORS = ['#F76100', '#ff8a33', '#ffd0a8']

/**
 * One vector mark: brief hold → spin → dip → fly → orange top flash.
 * (Skipped entirely when the app is launched with --startup.)
 */
export function IntroSplash({ reducedMotion = false, generation }: { reducedMotion?: boolean; generation?: number }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const edgeRef = useRef<HTMLDivElement>(null)
  const finishedRef = useRef(false)

  useEffect(() => {
    document.documentElement.classList.add('intro-root')
    document.body.classList.add('intro-root')
    return () => {
      document.documentElement.classList.remove('intro-root')
      document.body.classList.remove('intro-root')
    }
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    const edge = edgeRef.current
    if (!stage || !edge) return

    let cancelled = false
    const reduceMotion = reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const finish = async () => {
      if (finishedRef.current) return
      finishedRef.current = true
      try {
        await invoke('close_intro_window', { generation })
      } catch {
        if (cancelled) return
        try {
          await getCurrentWindow().destroy()
        } catch {
          try {
            await getCurrentWindow().close()
          } catch {
            /* gone */
          }
        }
      }
    }

    const run = async () => {
      if (reduceMotion) {
        await wait(400)
        if (cancelled) return
        await playOpacity(edge, 0, 1, 280)
        if (cancelled) return
        await playOpacity(edge, 1, 0, 360)
        if (!cancelled) await finish()
        return
      }

      // Hold on the vector mark, then motion
      await wait(520)
      if (cancelled) return

      await play(stage, [
        { transform: 'translate3d(0, 0, 0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: 'translate3d(0, 0, 0) scale(1.03) rotate(210deg)', offset: 0.55 },
        { transform: 'translate3d(0, 0, 0) scale(1) rotate(360deg)', opacity: 1 },
      ], {
        duration: 900,
        easing: 'cubic-bezier(0.65, 0.05, 0.36, 1)',
        fill: 'forwards',
      })
      if (cancelled) return

      await play(stage, [
        { transform: 'translate3d(0, 0, 0) scale(1) rotate(360deg)', opacity: 1 },
        { transform: 'translate3d(0, 28px, 0) scale(0.94) rotate(372deg)', opacity: 1 },
      ], {
        duration: 240,
        easing: 'cubic-bezier(0.33, 0, 0.2, 1)',
        fill: 'forwards',
      })
      if (cancelled) return

      await play(stage, [
        { transform: 'translate3d(0, 28px, 0) scale(0.94) rotate(372deg)', opacity: 1 },
        { transform: 'translate3d(0, -20vh, 0) scale(0.86) rotate(430deg)', opacity: 1, offset: 0.4 },
        { transform: 'translate3d(0, -120vh, 0) scale(0.55) rotate(520deg)', opacity: 1 },
      ], {
        duration: 560,
        easing: 'cubic-bezier(0.7, 0, 0.84, 0.2)',
        fill: 'forwards',
      })
      if (cancelled) return

      await wait(20)
      if (cancelled) return

      await playOpacity(edge, 0, 1, 260)
      if (cancelled) return
      await wait(220)
      if (cancelled) return
      await playOpacity(edge, 1, 0, 700)
      if (!cancelled) await finish()
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [reducedMotion, generation])

  return (
    <div className="intro-splash" aria-hidden>
      <div ref={stageRef} className="intro-stage">
        <div className="intro-logo">
          <AppLogo variant="intro" className="intro-logo__mark" />
        </div>
      </div>

      <div ref={edgeRef} className="intro-edge">
        <div className="intro-edge__bloom" />
        <StaticRadialGradient
          width="100%"
          height="100%"
          colors={EDGE_COLORS}
          colorBack="#00000000"
          radius={1.1}
          focalDistance={0.99}
          focalAngle={180}
          falloff={-0.36}
          mixing={0.5}
          distortion={0}
          grainMixer={0}
          grainOverlay={0}
          scale={0.55}
          offsetX={0}
          offsetY={-0.42}
          fit="cover"
          minPixelRatio={1}
          maxPixelCount={900_000}
          style={{ background: 'transparent' }}
        />
      </div>
    </div>
  )
}

function playOpacity(el: HTMLElement, from: number, to: number, duration: number): Promise<void> {
  el.style.opacity = String(from)
  return el
    .animate(
      [{ opacity: from }, { opacity: to }],
      { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    )
    .finished.then(() => {
      el.style.opacity = String(to)
    })
    .catch(() => undefined)
}

function play(
  el: HTMLElement,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Promise<void> {
  return el.animate(keyframes, options).finished.then(() => undefined).catch(() => undefined)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
