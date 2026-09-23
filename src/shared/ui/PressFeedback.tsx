import { createContext, useContext, useEffect, useRef, type ButtonHTMLAttributes, type HTMLAttributes } from 'react'
import './PressFeedback.css'
export type RippleDirection = 'outward' | 'inward'
const Feedback = createContext<(x: number, y: number, direction: RippleDirection) => void>(() => {})

function rippleFrames(direction: RippleDirection): Keyframe[] {
  return direction === 'inward'
    ? [{ transform: 'scale(1)', opacity: 0 }, { transform: 'scale(.65)', opacity: .12, offset: .3 }, { transform: 'scale(0)', opacity: 0 }]
    : [{ transform: 'scale(0)', opacity: .15 }, { transform: 'scale(1)', opacity: 0 }]
}

/** The ripple belongs to the surface, never to a moving button. */
export function IslandFeedback({ children, className = '', ...props }: HTMLAttributes<HTMLElement>) {
  const surface = useRef<HTMLElement>(null)
  const layer = useRef<HTMLSpanElement>(null)
  const animations = useRef<Animation[]>([])
  const clear = () => { animations.current.forEach((animation) => animation.cancel()); animations.current = [] }
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) clear() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { clear(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])
  const ripple = (x: number, y: number, direction: RippleDirection) => {
    const node = surface.current
    if (!node || !layer.current || document.hidden || !node.animate) return
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
  return <Feedback.Provider value={ripple}><section {...props} ref={surface} className={`island-feedback ${className}`}><span ref={layer} className="island-feedback__layer" aria-hidden="true" />{children}</section></Feedback.Provider>
}

/** Controlled icon state and command dispatch remain the caller's responsibility. */
export function PressFeedback({ children, onClick, onPointerDown, reducedMotion = false, direction = 'outward', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { reducedMotion?: boolean; direction?: RippleDirection }) {
  const ripple = useContext(Feedback)
  const feedback = (node: HTMLButtonElement, x?: number, y?: number) => {
    if (props.disabled || reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches || node.closest('.reduced-motion,[data-reduced-motion="true"]')) return
    const rect = node.getBoundingClientRect()
    ripple(x ?? rect.left + rect.width / 2, y ?? rect.top + rect.height / 2, direction)
  }
  return <button {...props} data-reduced-motion={reducedMotion || undefined} className={`press-feedback ${className}`} onPointerDown={(event) => {
    onPointerDown?.(event)
    if (!event.defaultPrevented && event.button === 0) feedback(event.currentTarget, event.clientX, event.clientY)
  }} onClick={(event) => {
    if (event.detail === 0) feedback(event.currentTarget)
    onClick?.(event)
  }}>{children}</button>
}
