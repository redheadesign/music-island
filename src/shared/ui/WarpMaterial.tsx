import { useReducedMotion } from 'framer-motion'
import { memo, useEffect, useRef, useState } from 'react'
import type { HTMLAttributes } from 'react'
import { WARP_SPEED } from './warpPreset'
import AsciiWarpField from './asciiScene/AsciiWarpField'
import './WarpMaterial.css'

export type WarpMaterialProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  speed?: number
  active?: boolean
  reducedMotion?: boolean
  className?: string
  /** Lets an established wrapper keep its field hook while sharing this renderer. */
  fieldClassName?: string
  /** Deterministic scene time in milliseconds for stills and motion exports. */
  frame?: number
  /** Raster budget independent of the logical size of the foxes. */
  maxPixelCount?: number
  /** Prewarm a below-the-fold field near the viewport, then retain its canvas. */
  deferUntilNearViewport?: boolean
}

/** Decorative preview material with a shared visibility and motion policy. */
export const WarpMaterial = memo(function WarpMaterial({
  speed = WARP_SPEED.resting,
  active = true,
  reducedMotion = false,
  className,
  fieldClassName,
  frame,
  maxPixelCount = 3_000_000,
  deferUntilNearViewport = false,
  ...attributes
}: WarpMaterialProps) {
  const root = useRef<HTMLDivElement>(null)
  const systemReducedMotion = useReducedMotion()
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )
  // Browsers without IntersectionObserver keep rendering; visibility still pauses it.
  const [intersecting, setIntersecting] = useState(true)
  const [prepared, setPrepared] = useState(() => !deferUntilNearViewport || frame != null)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const update = () => setDocumentVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(() => {
    if (prepared) return
    if (!deferUntilNearViewport || frame != null || typeof IntersectionObserver === 'undefined') {
      setPrepared(true)
      return
    }
    const node = root.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return
      setPrepared(true)
      observer.disconnect()
    }, { rootMargin: '600px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [prepared, deferUntilNearViewport, frame])

  useEffect(() => {
    const node = root.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setIntersecting(entry?.isIntersecting ?? true))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const visible = active && documentVisible && intersecting
  const moving = frame == null && visible && !reducedMotion && !systemReducedMotion
  const effectiveSpeed = moving ? speed : 0

  return (
    <div
      {...attributes}
      ref={root}
      className={['warp-material', className].filter(Boolean).join(' ')}
      data-speed={effectiveSpeed}
      data-motion={moving ? 'running' : 'paused'}
      data-prepared={prepared}
      aria-hidden="true"
    >
      <div className={['warp-material__field', fieldClassName].filter(Boolean).join(' ')}>
        {prepared && <AsciiWarpField speed={effectiveSpeed} visible={visible || frame != null} frame={frame} maxPixelCount={maxPixelCount} />}
      </div>
    </div>
  )
})
