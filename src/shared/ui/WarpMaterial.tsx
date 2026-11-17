import { Warp } from '@paper-design/shaders-react'
import { useReducedMotion } from 'framer-motion'
import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import type { InterfaceScene } from '../lib/interfaceTheme'
import { PAPER_WARP_PRESET, WARP_SPEED } from './warpPreset'
import './WarpMaterial.css'

const AsciiWarpField = lazy(() => import('./asciiScene/AsciiWarpField'))

export type WarpMaterialProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  speed?: number
  active?: boolean
  reducedMotion?: boolean
  className?: string
  /** Lets an established wrapper keep its field hook while sharing this renderer. */
  fieldClassName?: string
  variant?: 'default' | 'onboarding'
  scene?: InterfaceScene
  colorScheme?: 'light' | 'dark'
  /** Deterministic shader time in milliseconds for stills and motion exports. */
  frame?: number
  /** Soft-field raster budget; does not change its logical layout or preset. */
  maxPixelCount?: number
  /** Prewarm a below-the-fold field near the viewport, then retain its canvas. */
  deferUntilNearViewport?: boolean
  /** Custom field keeps the same visibility and reduced-motion lifecycle. */
  renderField?: (props: { speed: number; frame?: number; maxPixelCount: number }) => ReactNode
}

/** Decorative preview material with a shared visibility and motion policy. */
export const WarpMaterial = memo(function WarpMaterial({
  speed = WARP_SPEED.resting,
  active = true,
  reducedMotion = false,
  className,
  fieldClassName,
  variant = 'default',
  scene,
  colorScheme = 'dark',
  frame,
  maxPixelCount = 3_000_000,
  deferUntilNearViewport = false,
  renderField,
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
        {prepared && (renderField ? renderField({ speed: effectiveSpeed, frame, maxPixelCount }) : scene ? (
          <Suspense fallback={null}>
            <AsciiWarpField scene={scene} colorScheme={colorScheme}
              speed={effectiveSpeed} visible={visible || frame != null} frame={frame} maxPixelCount={maxPixelCount} />
          </Suspense>
        ) : <Warp
          {...PAPER_WARP_PRESET}
          {...(variant === 'onboarding' ? { distortion: .28, softness: .85 } : {})}
          width="100%"
          height="100%"
          speed={effectiveSpeed}
          frame={frame}
          minPixelRatio={2}
          maxPixelCount={maxPixelCount}
        />)}
      </div>
    </div>
  )
})
