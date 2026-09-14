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
}

/** Decorative warm graphite material. It performs no polling or device access. */
export const WarpMaterial = memo(function WarpMaterial({
  speed = 0.225,
  active = true,
  reducedMotion = false,
  className,
  fieldClassName,
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

  const moving = active && documentVisible && intersecting && !reducedMotion && !systemReducedMotion
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
          width="100%"
          height="100%"
          speed={effectiveSpeed}
          minPixelRatio={2}
          maxPixelCount={3_000_000}
        />
      </div>
    </div>
  )
})
