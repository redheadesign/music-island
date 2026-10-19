import { useEffect, useRef, useState } from 'react'

/** A bounded artwork clock. No frames while the surface or its document is hidden. */
export function useDictationMotion(active: boolean, still: boolean, level: number, demo: boolean) {
  const input = useRef({ level, demo })
  input.current = { level, demo }
  const clock = useRef({ elapsed: 0, envelope: 0 })
  const [frame, setFrame] = useState({ time: 0, level: 0 })
  useEffect(() => {
    if (!active || still) return
    let raf = 0, last: number | null = null
    const tick = (now: number) => {
      if (last !== null && now - last < 1000 / 30 - .5) {
        raf = requestAnimationFrame(tick)
        return
      }
      const delta = last === null ? 0 : Math.min(100, now - last)
      last = now; clock.current.elapsed += delta
      const time = clock.current.elapsed / 1000
      // Short silent pauses show the face between spoken phrases in the preview.
      const sample = input.current.demo ? Math.sin(time * 2.4) > -.25 ? .25 + .55 * Math.abs(Math.sin(time * 4.1)) : 0 : input.current.level
      const target = Math.max(0, Math.min(1, sample))
      clock.current.envelope += (target - clock.current.envelope) * (1 - Math.exp(-delta / (target > clock.current.envelope ? 25 : 120)))
      setFrame({ time, level: clock.current.envelope })
      raf = requestAnimationFrame(tick)
    }
    const update = () => {
      cancelAnimationFrame(raf); last = null
      if (document.visibilityState === 'visible') raf = requestAnimationFrame(tick)
    }
    document.addEventListener('visibilitychange', update)
    update()
    return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', update) }
  }, [active, still])
  return still ? { time: 0, level: demo ? .5 : level } : frame
}
