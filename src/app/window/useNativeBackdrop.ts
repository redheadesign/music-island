import { useLayoutEffect, useState, type RefObject } from 'react'
import { listen } from '@tauri-apps/api/event'
import { setOverlayBackdrop, type NativeBackdropFrame, type NativeBackdropRegion } from '../tauriApi'

export type NativeBackdropStatus = 'active' | 'unavailable' | undefined
let sequence = Date.now() * 1000

/** Measure the visible surface, including CSS transforms and ancestor fades. */
export function measureNativeBackdropRegion(surface: HTMLElement, root: HTMLElement): NativeBackdropRegion | null {
  const rect = surface.getBoundingClientRect()
  if (!(rect.width > 0 && rect.height > 0) || rect.right <= 0 || rect.bottom <= 0
    || rect.left >= window.innerWidth || rect.top >= window.innerHeight) return null
  const style = getComputedStyle(surface)
  if (style.display === 'none' || style.visibility === 'hidden') return null
  let opacity = 1
  for (let node: HTMLElement | null = surface; node; node = node.parentElement) {
    const ancestor = getComputedStyle(node)
    opacity *= Number(ancestor.opacity)
    if (ancestor.display === 'none' || ancestor.visibility === 'hidden') return null
    if (node === root) break
  }
  if (opacity <= 0.001) return null
  const scale = Math.min(rect.width / Math.max(surface.offsetWidth, 1), rect.height / Math.max(surface.offsetHeight, 1))
  const radius = (value: string) => {
    const parsed = Number.parseFloat(value)
    return value.includes('%') ? Math.min(rect.width, rect.height) * parsed / 100 : parsed * scale
  }
  return {
    left: rect.left, top: rect.top, width: rect.width, height: rect.height,
    radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(radius) as [number, number, number, number],
    opacity,
  }
}

/** DWM owns the backdrop; this hook only publishes each surface's geometry. */
export function useNativeBackdrop(root: RefObject<HTMLElement | null>, enabled: boolean, selector: string): NativeBackdropStatus {
  const [status, setStatus] = useState<NativeBackdropStatus>()
  useLayoutEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    const node = root.current
    if (!node) return
    setStatus('unavailable')
    let disposed = false
    let animation = 0
    let animateUntil = 0
    let inFlight = false
    let dirty = false
    let previous = ''
    let retry = 0
    let retryCount = 0
    const policy = matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)')
    const resize = new ResizeObserver(() => refresh())
    const surfaces = () => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll<HTMLElement>(selector)]
      .filter(surface => !surface.parentElement?.closest(selector))

    const available = () => enabled && !document.hidden && !policy.matches
    const frame = (capture: boolean): NativeBackdropFrame => ({
      generation: ++sequence,
      enabled: capture,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scale: window.devicePixelRatio || 1,
      regions: capture ? surfaces().flatMap(surface => {
        const region = measureNativeBackdropRegion(surface, node)
        return region ? [region] : []
      }) : [],
    })

    const publish = () => {
      animation = 0
      if (disposed) return
      if (inFlight) { dirty = true; return }
      dirty = false
      const next = frame(available())
      const signature = JSON.stringify({ ...next, generation: 0 })
      if (signature !== previous) {
        previous = signature
        inFlight = true
        void setOverlayBackdrop(next).then(active => {
          if (disposed) return
          setStatus(active && available() ? 'active' : 'unavailable')
          // A frame can precede show_overlay_ready or a native DPI update.
          if (!active && next.enabled && next.regions.length && retryCount < 2) {
            retryCount += 1
            retry = window.setTimeout(() => { previous = ''; refresh() }, 250)
          }
        }).catch(() => { if (!disposed) setStatus('unavailable') }).finally(() => {
          inFlight = false
          if (!disposed && (dirty || (available() && performance.now() < animateUntil)) && !animation) animation = requestAnimationFrame(publish)
        })
      }
      if (available() && performance.now() < animateUntil && !animation) animation = requestAnimationFrame(publish)
    }

    function refresh() {
      if (disposed) return
      window.clearTimeout(retry)
      dirty = true
      animateUntil = available() ? performance.now() + 360 : 0
      if (!animation) animation = requestAnimationFrame(publish)
    }
    const observeSurfaces = () => {
      resize.disconnect()
      if (available()) {
        resize.observe(node)
        surfaces().forEach(surface => resize.observe(surface))
      }
    }
    const mutations = new MutationObserver(records => {
      if (records.some(record => record.type === 'childList')) observeSurfaces()
      const targets = surfaces()
      if (records.some(record => record.type === 'childList' || targets.some(surface => record.target === surface || (record.target instanceof Element && record.target.contains(surface))))) refresh()
    })
    const syncAvailability = () => {
      mutations.disconnect()
      observeSurfaces()
      if (available()) mutations.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-state', 'data-phase', 'data-native-backdrop-surface'] })
      refresh()
    }
    window.addEventListener('resize', refresh)
    node.addEventListener('transitionend', refresh)
    node.addEventListener('animationend', refresh)
    document.addEventListener('visibilitychange', syncAvailability)
    policy.addEventListener('change', syncAvailability)
    let unlisten: (() => void) | undefined
    void listen('overlay:backdrop-invalidated', () => { previous = ''; retryCount = 0; refresh() }).then(remove => {
      if (disposed) remove()
      else unlisten = remove
    }).catch(() => undefined)
    syncAvailability()
    return () => {
      disposed = true
      cancelAnimationFrame(animation)
      window.clearTimeout(retry)
      mutations.disconnect()
      resize.disconnect()
      unlisten?.()
      window.removeEventListener('resize', refresh)
      node.removeEventListener('transitionend', refresh)
      node.removeEventListener('animationend', refresh)
      document.removeEventListener('visibilitychange', syncAvailability)
      policy.removeEventListener('change', syncAvailability)
      void setOverlayBackdrop(frame(false)).catch(() => undefined)
    }
  }, [root, enabled, selector])
  return status
}
