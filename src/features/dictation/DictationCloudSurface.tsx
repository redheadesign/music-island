import { useEffect, useRef, useState, type RefObject } from 'react'
import { DictationCloudRenderer, type CloudFrame } from './DictationCloudRenderer'
import type { DictationAppearance } from '../../shared/lib/dictationAppearance'
import { getCloudGeometry } from './cloudGeometry'

export function DictationCloudSurface({ appearance, phase, levels, still = false, active = true, demo = false, coreRef, expanded = false, singleControl = false }: {
  appearance: DictationAppearance; phase: string; levels: number[]; still?: boolean; active?: boolean; demo?: boolean
  coreRef?: RefObject<HTMLElement | null>; expanded?: boolean; singleControl?: boolean
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const input = useRef({ appearance, phase, levels, demo, coreRef, expanded, singleControl, active, still })
  input.current = { appearance, phase, levels, demo, coreRef, expanded, singleControl, active, still }
  const redraw = useRef<(() => void) | null>(null)
  // A cheap, visible material while WebGL is being prepared (or unavailable).
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const surface = canvas.current
    if (!surface) return
    let renderer: DictationCloudRenderer | null = null
    let raf = 0, last: number | null = null, time = 0, envelope = 0, attempted = false
    let accent = [94/255,106/255,210/255]
    const paint = (delta: number) => {
      if (!renderer) return
      const next = input.current, { still, active } = next, recording = ['recording','streaming'].includes(next.phase)
      const peak = Math.max(0,...next.levels.filter(Number.isFinite))
      const sample = next.demo && recording ? Math.sin(time*2.4)>-.25 ? .25+.55*Math.abs(Math.sin(time*4.1)) : 0 : recording ? peak : 0
      const target = Math.max(0,Math.min(1,sample))
      envelope = still || !delta ? target : envelope+(target-envelope)*(1-Math.exp(-delta/(target>envelope?.025:.12)))
      const bounds = surface.getBoundingClientRect(), coreBounds = next.coreRef?.current?.getBoundingClientRect()
      const { width, height, coreWidth, coreX } = getCloudGeometry({
        width: surface.clientWidth, height: surface.clientHeight, bounds, coreBounds, expanded: next.expanded,
      })
      const controls = !next.expanded && next.coreRef ? Math.max(0,Math.min(1,(width-92)/(next.singleControl ? 40 : 80))) : 0
      const frame: CloudFrame = { time: still ? 0 : time, delta, level: envelope, phase: next.phase, instant: still || !active,
        appearance: next.appearance, controls, coreWidth, coreX, singleControl: next.singleControl, coreHeight: next.expanded ? height-6 : 44,
        coreY: next.expanded ? height/2 : height-25, accent }
      try { renderer.render(frame); setReady(true) } catch { setReady(false); cancelAnimationFrame(raf); renderer.dispose(); renderer=null }
    }
    const tick = (now: number) => {
      // The tiny surface does not need to run at a 120/144 Hz monitor's rate.
      if (last === null || now-last >= 1000/30-.5) {
        const delta = last === null ? 0 : Math.min(.1,(now-last)/1000)
        last=now; time+=delta; paint(delta)
      }
      if (renderer) raf=requestAnimationFrame(tick)
    }
    const update = () => {
      cancelAnimationFrame(raf); last=null
      const next = input.current
      if (!next.active || document.visibilityState !== 'visible') return
      const match = getComputedStyle(surface).getPropertyValue('--accent').trim().match(/^#([\da-f]{6})$/i)
      accent = match ? [0,2,4].map(at=>parseInt(match[1].slice(at,at+2),16)/255) : [94/255,106/255,210/255]
      if (renderer) {
        paint(0)
        if (!next.still && renderer) raf=requestAnimationFrame(tick)
      } else if (!attempted) {
        // Let the SVG fox and fallback capsule paint before compiling shaders.
        raf=requestAnimationFrame(() => { raf=requestAnimationFrame(initialize) })
      }
    }
    const initialize = () => {
      attempted=true
      try { renderer=new DictationCloudRenderer(surface); update() }
      catch { renderer?.dispose(); renderer=null; setReady(false) }
    }
    const lost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(raf); attempted=true; renderer?.dispose(); renderer=null; setReady(false) }
    const restored = () => { attempted=false; update() }
    redraw.current = update
    document.addEventListener('visibilitychange',update)
    surface.addEventListener('webglcontextlost',lost)
    surface.addEventListener('webglcontextrestored',restored)
    return () => {
      cancelAnimationFrame(raf); redraw.current=null; renderer?.dispose()
      document.removeEventListener('visibilitychange',update)
      surface.removeEventListener('webglcontextlost',lost);surface.removeEventListener('webglcontextrestored',restored)
    }
  }, [])
  useEffect(() => { redraw.current?.() }, [active,still,appearance,phase,expanded,singleControl])
  useEffect(() => { if (active && still) redraw.current?.() }, [active,still,levels])
  return <canvas ref={canvas} className={'dictation-cloud-surface'+(appearance.theme==='wave'?' dictation-visual--wave':'')} data-fallback={!ready || undefined} aria-hidden="true" />
}

