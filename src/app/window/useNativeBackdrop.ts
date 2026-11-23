import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { listen } from '@tauri-apps/api/event'
import { DEFAULT_GLASS_MATERIAL } from '../../shared/lib/glassMaterialTokens'
import { setOverlayBackdrop, type NativeBackdropFrame, type NativeBackdropRegion, type NativeDesktopLens } from '../tauriApi'

export type NativeBackdropStatus = 'pending' | 'active' | 'unavailable' | undefined
let sequence = Date.now() * 1000
const defaultFrost = DEFAULT_GLASS_MATERIAL.frost / 100
const viewportRetryDelays = [16, 48, 120] as const

/** Measure the visible surface, including CSS transforms and ancestor fades. */
export function measureNativeBackdropRegion(surface: HTMLElement, root: HTMLElement, styles = new Map<HTMLElement, CSSStyleDeclaration>()): NativeBackdropRegion | null {
  const rect = surface.getBoundingClientRect()
  if (!(rect.width > 0 && rect.height > 0) || rect.right <= 0 || rect.bottom <= 0
    || rect.left >= window.innerWidth || rect.top >= window.innerHeight) return null
  let opacity = 1
  for (let node: HTMLElement | null = surface; node; node = node.parentElement) {
    const ancestor = styles.get(node) ?? getComputedStyle(node)
    styles.set(node, ancestor)
    opacity *= Number(ancestor.opacity || 1)
    if (ancestor.display === 'none' || ancestor.visibility === 'hidden') return null
    if (node === root) break
  }
  if (opacity <= 0.001) return null
  const style = styles.get(surface)!
  const override = parseFloat(style.getPropertyValue('--glass-region-frost'))
  const blurRadius = parseFloat(style.getPropertyValue('--glass-region-blur'))
  const scale = Math.min(rect.width / Math.max(surface.offsetWidth, 1), rect.height / Math.max(surface.offsetHeight, 1))
  const radius = (value: string) => {
    const parsed = Number.parseFloat(value) || 0
    return value.includes('%') ? Math.min(rect.width, rect.height) * parsed / 100 : parsed * scale
  }
  return {
    left: rect.left, top: rect.top, width: rect.width, height: rect.height,
    radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius].map(radius) as [number, number, number, number],
    opacity,
    ...(Number.isFinite(override) && override >= 0 && { frost: Math.min(1, override) }),
    ...(Number.isFinite(blurRadius) && blurRadius > 0 && { blurRadius: Math.min(24, blurRadius) }),
  }
}

/** DWM owns the backdrop; this hook only publishes each surface's geometry. */
export function useNativeBackdrop(root: RefObject<HTMLElement | null>, enabled: boolean, selector: string, frost = defaultFrost, regionFrostKey = '', optics?: NativeDesktopLens, prepareCapture = false): NativeBackdropStatus {
  const [status, setStatus] = useState<NativeBackdropStatus>()
  const frostAmount = useRef(defaultFrost)
  const individualFrost = useRef('')
  const lens = useRef<NativeDesktopLens | undefined>(undefined)
  const capturing = useRef(false)
  const changeFrost = useRef<((crossedZero: boolean) => void) | null>(null)
  useLayoutEffect(() => {
    const amount = Number.isFinite(frost) ? Math.min(1, Math.max(0, frost)) : defaultFrost
    const crossedZero = (!amount && !regionFrostKey && !optics) !== (!frostAmount.current && !individualFrost.current && !lens.current)
    frostAmount.current = amount
    individualFrost.current = regionFrostKey
    lens.current = optics
    capturing.current = prepareCapture
    changeFrost.current?.(crossedZero)
  }, [frost, regionFrostKey, optics, prepareCapture])
  useLayoutEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    const node = root.current
    if (!node) return
    setStatus(current => current ?? 'pending')
    let disposed = false
    let animation = 0
    let mountUntil = 0
    let inFlight = false
    let dirty = false
    let previous = ''
    let retry = 0
    let retryCount = 0
    let unsupported = false
    let surfaces: HTMLElement[] = []
    const ancestors = new Set<Element>()
    const transitions = new Map<Element, Set<string>>()
    const policy = matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)')
    const resize = new ResizeObserver(() => refresh())
    const available = () => enabled && !document.hidden && !policy.matches && !unsupported
    const measuring = () => available() && (frostAmount.current > 0 || Boolean(individualFrost.current || lens.current))
    const frame = (capture: boolean): NativeBackdropFrame => {
      const styles = new Map<HTMLElement, CSSStyleDeclaration>()
      const regions: NativeBackdropRegion[] = []
      let desktopLens: NativeBackdropFrame['lens']
      if (capture) for (const surface of surfaces) {
        const region = measureNativeBackdropRegion(surface, node, styles)
        if (!region) continue
        if (lens.current && surface.classList.contains('island-card')) {
          desktopLens = { ...lens.current, region: regions.length }
        } else if ((region.frost ?? frostAmount.current) === 0) continue
        regions.push(region)
      }
      return {
        generation: ++sequence,
        enabled: capture,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scale: window.devicePixelRatio || 1,
        frost: frostAmount.current,
        regions,
        ...(capture && lens.current && { prewarmLens: true, ...(capturing.current && { prepareCapture: true }) }),
        ...(desktopLens && { lens: desktopLens }),
      }
    }

    const inMotion = () => transitions.size > 0 || performance.now() < mountUntil

    const publish = () => {
      animation = 0
      if (disposed) return
      if (inFlight) { dirty = true; return }
      dirty = false
      const next = frame(available())
      const signature = JSON.stringify({ ...next, generation: 0 })
      if (signature !== previous) {
        window.clearTimeout(retry)
        previous = signature
        inFlight = true
        void setOverlayBackdrop(next).then(active => {
          if (disposed) return
          if (active !== null && available()) {
            setStatus(active ? 'active' : 'unavailable')
            if (active) retryCount = 0
            else {
              unsupported = true
              syncAvailability()
            }
          }
          // Keep the material during a show/DPI race. A policy denial is final
          // until Windows invalidates it, so it never starts a retry loop.
          const retryDelay = viewportRetryDelays[retryCount]
          if (active === null && next.enabled && next.regions.length && retryDelay !== undefined) {
            retryCount += 1
            retry = window.setTimeout(() => { previous = ''; refresh() }, retryDelay)
          }
        }).catch(() => { if (!disposed) setStatus('unavailable') }).finally(() => {
          inFlight = false
          if (!disposed && (dirty || (available() && inMotion())) && !animation) animation = requestAnimationFrame(publish)
        })
      }
      if (available() && inMotion() && !animation && !inFlight) animation = requestAnimationFrame(publish)
    }

    function refresh() {
      if (disposed) return
      dirty = true
      if (!animation && !inFlight) animation = requestAnimationFrame(publish)
    }
    const observeSurfaces = () => {
      const found = measuring() ? [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll<HTMLElement>(selector)]
        .filter(surface => !surface.parentElement?.closest(selector)) : []
      const path = new Set<Element>()
      for (const surface of found) {
        for (let parent: Element | null = surface; parent && !path.has(parent); parent = parent.parentElement) {
          path.add(parent)
          if (parent === node) break
        }
      }
      if (found.length === surfaces.length && found.every((surface, index) => surface === surfaces[index])
        && path.size === ancestors.size && [...path].every(element => ancestors.has(element))) return
      resize.disconnect()
      layout.disconnect()
      ancestors.clear()
      surfaces = found
      if (measuring()) {
        resize.observe(node)
        for (const surface of surfaces) resize.observe(surface)
        for (const element of path) {
          ancestors.add(element)
          layout.observe(element, { attributes: true, attributeFilter: ['style', 'class', 'hidden', 'data-state', 'data-phase', 'data-expanded', 'data-audio-progress', 'data-recording-control', 'data-island-arrangement'] })
        }
      }
      for (const target of transitions.keys()) if (!ancestors.has(target)) transitions.delete(target)
      // Framer can start the entry transform using WAAPI after insertion.
      // Only mounting a new silhouette needs this short sampling window.
      mountUntil = found.length ? performance.now() + 320 : 0
    }
    // Inline styles of the level meter, pixel fox and wave change every frame.
    // Only a surface or one of its layout ancestors can move its native mask.
    const layout = new MutationObserver(refresh)
    const includesSurface = (part: Node) => part instanceof Element && (part.matches(selector) || part.querySelector(selector) || surfaces.some(surface => part.contains(surface)))
    const mutations = new MutationObserver(records => {
      let membership = false
      let geometry = false
      for (const record of records) {
        if (!(record.target instanceof Element)) continue
        if (record.type === 'childList') {
          // Text, meter bars and optical art frequently change inside a stable
          // silhouette. Their content is not native window geometry.
          const parts = [...record.addedNodes, ...record.removedNodes]
          membership ||= parts.some(includesSurface)
          geometry ||= ancestors.has(record.target) && !surfaces.includes(record.target as HTMLElement) && parts.some(part => part instanceof Element)
        } else {
          membership ||= record.target.matches(selector) || surfaces.includes(record.target as HTMLElement)
        }
      }
      if (membership) observeSurfaces()
      if (geometry || membership) refresh()
    })
    const transitionChanged = (event: TransitionEvent) => {
      const target = event.target
      if (!(target instanceof Element) || !ancestors.has(target) || event.pseudoElement) return
      if (!/^(opacity|transform|translate|scale|rotate|inset|top|right|bottom|left|margin|border-.*-radius)/.test(event.propertyName)) return
      const properties = transitions.get(target) ?? new Set<string>()
      if (event.type === 'transitionrun') properties.add(event.propertyName)
      else properties.delete(event.propertyName)
      if (properties.size) transitions.set(target, properties)
      else transitions.delete(target)
      refresh()
    }
    const syncAvailability = () => {
      mutations.disconnect()
      observeSurfaces()
      if (measuring()) mutations.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-native-backdrop-surface'] })
      refresh()
    }
    changeFrost.current = crossedZero => crossedZero ? syncAvailability() : refresh()
    window.addEventListener('resize', refresh)
    node.addEventListener('transitionrun', transitionChanged)
    node.addEventListener('transitionend', transitionChanged)
    node.addEventListener('transitioncancel', transitionChanged)
    document.addEventListener('visibilitychange', syncAvailability)
    policy.addEventListener('change', syncAvailability)
    let unlisten: (() => void) | undefined
    void listen('overlay:backdrop-invalidated', () => { previous = ''; retryCount = 0; unsupported = false; syncAvailability() }).then(remove => {
      if (disposed) remove()
      else unlisten = remove
    }).catch(() => undefined)
    syncAvailability()
    return () => {
      disposed = true
      changeFrost.current = null
      cancelAnimationFrame(animation)
      window.clearTimeout(retry)
      mutations.disconnect()
      layout.disconnect()
      resize.disconnect()
      unlisten?.()
      window.removeEventListener('resize', refresh)
      node.removeEventListener('transitionrun', transitionChanged)
      node.removeEventListener('transitionend', transitionChanged)
      node.removeEventListener('transitioncancel', transitionChanged)
      document.removeEventListener('visibilitychange', syncAvailability)
      policy.removeEventListener('change', syncAvailability)
      void setOverlayBackdrop(frame(false)).catch(() => undefined)
    }
  }, [root, enabled, selector])
  return status
}
