import { useEffect, useRef } from 'react'
import type { InterfaceScene } from '../../lib/interfaceTheme'
import { paintAnimalScene } from './animalCanvas'

const FRAME_INTERVAL_MS = 1000 / 24
const MAX_SCENE_PIXELS = 350_000

interface AsciiWarpFieldProps {
  scene: InterfaceScene
  colorScheme: 'light' | 'dark'
  speed: number
  visible: boolean
  frame?: number
  maxPixelCount: number
}

/** Shares WarpMaterial's visibility policy. The clock survives moving between preview slots. */
export default function AsciiWarpField({ scene, colorScheme, speed, visible, frame, maxPixelCount }: AsciiWarpFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const elapsed = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !visible) return
    const context = canvas.getContext('2d')
    if (!context) return

    let width = 0
    let height = 0
    const draw = () => {
      if (width && height) paintAnimalScene(context, {
        sceneId: scene, appearance: colorScheme, time: (frame ?? elapsed.current) / 1000, width, height,
      })
    }
    const resize = () => {
      width = canvas.clientWidth
      height = canvas.clientHeight
      if (!width || !height) return
      const budget = Math.min(maxPixelCount, MAX_SCENE_PIXELS)
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(budget / (width * height)))
      const pixelWidth = Math.max(1, Math.floor(width * ratio))
      const pixelHeight = Math.max(1, Math.floor(height * ratio))
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight
      context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0)
      draw()
    }

    resize()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(canvas)
    window.addEventListener('resize', resize)
    let previous = performance.now()
    const interval = speed > 0 ? window.setInterval(() => {
      const now = performance.now()
      if (!document.hidden && width && height) {
        elapsed.current += Math.min(100, now - previous) * speed
        draw()
      }
      previous = now
    }, FRAME_INTERVAL_MS) : undefined
    return () => {
      if (interval !== undefined) window.clearInterval(interval)
      observer?.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [scene, colorScheme, speed, visible, frame, maxPixelCount])

  return <canvas ref={canvasRef} className="warp-material__ascii" data-ascii-scene={scene} aria-hidden="true" />
}
