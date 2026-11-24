import { createContext, useContext, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type Ref } from 'react'
import { normalizeIslandShader, type IslandShaderTuning } from '../lib/shaderTuning'
import { IslandGlassOptic } from './IslandGlassOptic'
import { IslandParticles } from './IslandParticles'
import './PressFeedback.css'
export type RippleDirection = 'outward' | 'inward'
const Feedback = createContext<(x: number, y: number, direction: RippleDirection) => void>(() => {})

function rippleFrames(direction: RippleDirection): Keyframe[] {
  return direction === 'inward'
    ? [{ transform: 'scale(1)', opacity: 0 }, { transform: 'scale(.65)', opacity: .12, offset: .3 }, { transform: 'scale(0)', opacity: 0 }]
    : [{ transform: 'scale(0)', opacity: .15 }, { transform: 'scale(1)', opacity: 0 }]
}

type IslandFeedbackProps = HTMLAttributes<HTMLElement> & {
  glassOptic?: boolean
  opticActive?: boolean
  particles?: boolean
  playbackMotion?: boolean | null
  playbackWave?: boolean
  ambientRef?: Ref<HTMLSpanElement>
  shaderTuning?: Partial<IslandShaderTuning>
}

type WavePhase = 'idle' | 'steady' | 'launch' | 'return'
type WaveIntent = { playing: boolean; requestedAt: number }
const WAVE_CONFIRM_MS = 2_500
const WAVE_CONFIRM_GRACE_MS = 300

function restingWave(playing: boolean): WavePhase {
  return playing ? 'steady' : 'idle'
}

/** The ripple belongs to the surface, never to a moving button. */
export function IslandFeedback({ children, className = '', glassOptic = false, opticActive = true, particles = false, playbackMotion, playbackWave = false, ambientRef, shaderTuning, ...props }: IslandFeedbackProps) {
  const shader = useMemo(() => normalizeIslandShader(shaderTuning), [shaderTuning])
  const surface = useRef<HTMLElement>(null)
  const layer = useRef<HTMLSpanElement>(null)
  const animations = useRef<Animation[]>([])
  const confirmed = playbackMotion === undefined ? true : playbackMotion
  const [wave, setWave] = useState(() => ({
    enabled: playbackWave,
    playing: confirmed ?? false,
    phase: restingWave(confirmed ?? false),
    intent: null as WaveIntent | null,
    late: null as WaveIntent | null,
  }))
  const wavePlaying = wave.intent?.playing ?? confirmed ?? wave.playing
  const lateConfirmation = wave.late?.playing === confirmed ? wave.late : null
  // Opening the island mounts at the current playback state. Only a change
  // while the rings are enabled creates an outward or inward gesture.
  if (wave.playing !== wavePlaying || wave.enabled !== playbackWave || lateConfirmation) {
    const acknowledging = lateConfirmation && Date.now() - lateConfirmation.requestedAt <= 2 * WAVE_CONFIRM_MS
    const transitioning = wave.playing !== wavePlaying && wave.enabled && playbackWave && !document.hidden && !acknowledging
    setWave({
      ...wave,
      enabled: playbackWave,
      playing: wavePlaying,
      phase: transitioning ? (wavePlaying ? 'launch' : 'return') : restingWave(wavePlaying),
      intent: playbackWave ? wave.intent : null,
      late: playbackWave && !lateConfirmation ? wave.late : null,
    })
  }
  useEffect(() => {
    const intent = wave.intent
    if (!intent) return
    const remaining = Math.max(0, intent.requestedAt + WAVE_CONFIRM_MS - Date.now())
    const acknowledged = confirmed === intent.playing
    const delay = acknowledged ? Math.min(remaining, WAVE_CONFIRM_GRACE_MS) : remaining
    const timeout = window.setTimeout(() => {
      setWave(current => {
        if (current.intent !== intent) return current
        const playing = confirmed ?? current.playing
        return {
          ...current, playing, intent: null,
          late: acknowledged ? null : intent,
          phase: playing === current.playing ? current.phase : restingWave(playing),
        }
      })
    }, delay)
    return () => window.clearTimeout(timeout)
  }, [confirmed, wave.intent])
  const clear = () => { animations.current.forEach((animation) => animation.cancel()); animations.current = [] }
  useEffect(() => {
    const onVisibility = () => {
      surface.current?.toggleAttribute('data-document-hidden', document.hidden)
      if (document.hidden) {
        clear()
        setWave(current => {
          const phase = restingWave(current.playing)
          return current.phase === phase ? current : { ...current, phase }
        })
      }
    }
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { clear(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])
  const ripple = (x: number, y: number, direction: RippleDirection) => {
    const node = surface.current
    if (!node || !layer.current || document.hidden) return
    if (glassOptic && playbackWave && playbackMotion !== undefined) {
      const playing = direction === 'outward'
      setWave(current => current.intent?.playing === playing ? current : {
        ...current, intent: { playing, requestedAt: Date.now() }, late: null,
      })
      return
    }
    if (!node.animate) return
    const rect = node.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const cx = (x - rect.left) * node.clientWidth / rect.width
    const cy = (y - rect.top) * node.clientHeight / rect.height
    const diameter = Math.hypot(Math.max(cx, node.clientWidth - cx), Math.max(cy, node.clientHeight - cy)) * 2
    if (animations.current.length >= 3) animations.current.shift()?.cancel()
    const ink = document.createElement('span')
    ink.className = 'island-feedback__wave'
    Object.assign(ink.style, { width: `${diameter}px`, height: `${diameter}px`, left: `${cx - diameter / 2}px`, top: `${cy - diameter / 2}px` })
    layer.current.append(ink)
    const animation = ink.animate(rippleFrames(direction), { duration: 420, easing: 'cubic-bezier(.2,0,0,1)' })
    animations.current.push(animation)
    const remove = () => { ink.remove(); animations.current = animations.current.filter((item) => item !== animation) }
    void animation.finished.then(remove, remove)
  }
  return <Feedback.Provider value={ripple}>
    <section {...props} data-island-optical={glassOptic || undefined} ref={surface} className={`island-feedback ${className}`}>
      {glassOptic && <IslandGlassOptic active={opticActive} refract />}
      <span ref={layer} className="island-feedback__layer" aria-hidden="true">
        {particles || playbackWave ? (
          <span
            ref={ambientRef}
            className="island-feedback__ambient"
            data-bass-gain={shader.bassGain}
            style={{
              '--island-wave-duration': `calc(var(--motion-unit) * ${210 / shader.waveSpeed})`,
              '--wave-softness': `${shader.waveBlur}px`, '--wave-reach': shader.waveReach,
              '--wave-intensity': shader.waveIntensity / 100, '--particle-brightness': shader.particleBrightness / 100,
              '--particle-speed': shader.particleSpeed, '--particle-scale': shader.particleSize,
              '--particle-distance': shader.particleFall,
              ...(shader.waveColor && { '--island-wave-crest': `color-mix(in srgb, ${shader.waveColor} 50%, transparent)`,
                '--island-wave-trough': `color-mix(in srgb, ${shader.waveColor} 21%, transparent)` }),
              ...(shader.particleColor && { '--island-particle-ink': shader.particleColor, '--island-particle-soft-ink': shader.particleColor }),
            } as CSSProperties}
            data-playback-wave={playbackWave || undefined}
            data-playback-motion={wavePlaying ? 'playing' : 'paused'}
            data-wave-phase={playbackWave ? wave.phase : undefined}
          >
            {playbackWave ? <span className="island-feedback__rings" onAnimationEnd={event => {
              if (event.animationName === 'island-glass-wave-settle') {
                setWave(current => current.phase === 'launch' ? { ...current, phase: 'steady' } : current)
              }
            }} /> : null}
            {playbackWave && wave.phase === 'launch' ? <span className="island-feedback__launch" /> : null}
            {particles && shader.particleCount > 0 ? <IslandParticles count={shader.particleCount} /> : null}
          </span>
        ) : null}
      </span>
      {children}
    </section>
  </Feedback.Provider>
}

/** Controlled icon state and command dispatch remain the caller's responsibility. */
export function PressFeedback({ children, onClick, reducedMotion = false, direction = 'outward', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { reducedMotion?: boolean; direction?: RippleDirection }) {
  const ripple = useContext(Feedback)
  const feedback = (node: HTMLButtonElement, x?: number, y?: number) => {
    if (props.disabled || reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches || node.closest('.reduced-motion,[data-reduced-motion="true"]')) return
    const rect = node.getBoundingClientRect()
    ripple(x ?? rect.left + rect.width / 2, y ?? rect.top + rect.height / 2, direction)
  }
  return <button {...props} data-reduced-motion={reducedMotion || undefined} className={`press-feedback ${className}`} onClick={(event) => {
    if (event.detail === 0) feedback(event.currentTarget)
    else feedback(event.currentTarget, event.clientX, event.clientY)
    onClick?.(event)
  }}>{children}</button>
}
