import { ShaderMount } from '@paper-design/shaders'
import { useEffect, useRef } from 'react'
import fragment from './liveWave.glsl?raw'

function coverUniforms(root: HTMLElement) {
  const style = getComputedStyle(root)
  const color = (variable: string, fallback: number[]) => {
    const channels = style.getPropertyValue(variable).split(',').map(Number)
    return root.dataset.coverArt === 'true' && channels.length === 3 && channels.every(Number.isFinite)
      ? channels.map(channel => Math.min(255, Math.max(0, channel)) / 255)
      : fallback
  }
  return {
    u_primary: color('--artwork-primary', [.62, .63, .64]),
    u_secondary: color('--artwork-secondary', [.37, .38, .39]),
  }
}

/** Only the live-wave option mounts a GL surface. The ambient layer owns its
 * playback state and receives bass from the same native stream as particles. */
export function LiveWave() {
  const host = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const node = host.current
    const root = node?.closest<HTMLElement>('.island-root')
    const ambient = node?.parentElement
    if (!node || !root || !ambient) return

    let shader: ShaderMount | undefined
    let failed = false
    const bass = () => Number(ambient.style.getPropertyValue('--island-bass')) || 0
    const speed = () => ambient.dataset.playbackMotion === 'paused' ? 0 : .96 + bass() * .56
    const canvasLost = () => {
      failed = true
      shader?.dispose()
      shader = undefined
      node.dataset.rendering = 'fallback'
    }
    const mount = () => {
      if (shader || failed) return
      try {
        shader = new ShaderMount(node, fragment, { ...coverUniforms(root), u_bass: bass() },
          { alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' },
          speed(), 0, 1, 90_000)
        node.dataset.rendering = 'webgl'
        shader.canvasElement.addEventListener('webglcontextlost', canvasLost, { once: true })
      } catch {
        // A muted cover gradient under the canvas remains available without WebGL.
        failed = true
        node.dataset.rendering = 'fallback'
        node.querySelector('canvas')?.remove()
      }
    }

    // Hidden/paused previews and reduced-motion or opaque materials expose no
    // canvas area. The mount also suspends its clock offscreen or in a hidden tab.
    const reveal = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRect.width && entry.intersectionRect.height) {
        mount()
        reveal.disconnect()
      }
    })
    reveal.observe(node)
    const artwork = new MutationObserver(() => shader?.setUniforms(coverUniforms(root)))
    artwork.observe(root, { attributes: true, attributeFilter: ['style', 'data-cover-art'] })
    const playback = new MutationObserver(() => {
      if (!shader) return
      shader.setSpeed(speed())
      shader.setUniforms({ u_bass: bass() })
    })
    playback.observe(ambient, { attributes: true, attributeFilter: ['style', 'data-playback-motion'] })
    return () => {
      reveal.disconnect()
      artwork.disconnect()
      playback.disconnect()
      if (shader) {
        const canvas = shader.canvasElement
        canvas.removeEventListener('webglcontextlost', canvasLost)
        // Each expanded island owns this canvas. Release its driver resources
        // immediately so repeated openings don't consume the WebView's context limit.
        const contextLoss = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')
        shader.dispose()
        contextLoss?.loseContext()
      }
      delete node.dataset.rendering
    }
  }, [])
  return <span ref={host} className="island-live-wave" aria-hidden="true" />
}
