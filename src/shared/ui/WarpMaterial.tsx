import { Warp } from '@paper-design/shaders-react'
import { useReducedMotion } from 'framer-motion'
import { memo, useEffect, useRef, useState } from 'react'
import type { HTMLAttributes } from 'react'
import './WarpMaterial.css'

const PAPER_WARP_PRESET = {
  colors: ['#171412', '#897263', '#d7c8b8'],
  proportion: 0.24,
  softness: 1,
  distortion: 0.21,
  swirl: 0.57,
  swirlIterations: 10,
  shape: 'edge' as const,
  shapeScale: 0.75,
  scale: 2,
  rotation: 0,
}

export type WarpMaterialProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  speed?: number
  active?: boolean
  reducedMotion?: boolean
  className?: string
  /** Lets an established wrapper keep its field hook while sharing this renderer. */
  fieldClassName?: string
  variant?: 'default' | 'onboarding'
  /** Deterministic shader time in milliseconds for stills and motion exports. */
  frame?: number
  /** Soft-field raster budget; does not change its logical layout or preset. */
  maxPixelCount?: number
}

/** Decorative warm graphite material. It performs no polling or device access. */
export const WarpMaterial = memo(function WarpMaterial({
  speed = 0.225,
  active = true,
  reducedMotion = false,
  className,
  fieldClassName,
  variant = 'default',
  frame,
  maxPixelCount = 3_000_000,
  ...attributes
}: WarpMaterialProps) {
  const root = useRef<HTMLDivElement>(null)
  const systemReducedMotion = useReducedMotion()
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )
  // Browsers without IntersectionObserver keep rendering; visibility still pauses it.
  const [intersecting, setIntersecting] = useState(true)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const update = () => setDocumentVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(() => {
    const node = root.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setIntersecting(entry?.isIntersecting ?? true))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const moving = frame == null && active && documentVisible && intersecting && !reducedMotion && !systemReducedMotion
  const effectiveSpeed = moving ? speed : 0

  return (
    <div
      {...attributes}
      ref={root}
      className={['warp-material', className].filter(Boolean).join(' ')}
      data-speed={effectiveSpeed}
      data-motion={moving ? 'running' : 'paused'}
      aria-hidden="true"
    >
      <div className={['warp-material__field', fieldClassName].filter(Boolean).join(' ')}>
        <Warp
          {...PAPER_WARP_PRESET}
          {...(variant === 'onboarding' ? { colors: ['#231c2c', '#ad867e', '#ebc8a6', '#c4adf0'], distortion: .28, softness: .85 } : {})}
          width="100%"
          height="100%"
          speed={effectiveSpeed}
          frame={frame}
          minPixelRatio={2}
          maxPixelCount={maxPixelCount}
        />
      </div>
    </div>
  )
})
