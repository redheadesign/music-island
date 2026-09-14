import { toPng } from 'html-to-image'

/** Export only the composed scene. Native mocks and image tooling stay in Storybook. */
export async function exportReleaseScene(node: HTMLElement) {
  const restore: Array<() => void> = []
  try {
    // html-to-image keeps SVG children intact, so resolve their inherited styles.
    for (const child of node.querySelectorAll<SVGElement>('svg, svg *')) {
      const previous = child.getAttribute('style')
      const computed = getComputedStyle(child)
      const values = ['fill', 'fill-rule', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'color'].map(property => [property, computed.getPropertyValue(property)])
      for (const [property, value] of values) child.style.setProperty(property, value)
      restore.push(() => previous == null ? child.removeAttribute('style') : child.setAttribute('style', previous))
    }
    // Paper releases its WebGL drawing buffer between frames. Repaint the same
    // bound fullscreen triangle pair and snapshot synchronously, before cloning.
    for (const canvas of node.querySelectorAll<HTMLCanvasElement>('.warp-material canvas')) {
      const gl = canvas.getContext('webgl2')
      if (!gl) continue
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      const data = canvas.toDataURL()
      const original = canvas.toDataURL
      canvas.toDataURL = () => data
      restore.push(() => { canvas.toDataURL = original })
    }
    await document.fonts.ready
    return await toPng(node, { pixelRatio: 1, skipAutoScale: true })
  } finally {
    for (const reset of restore.reverse()) reset()
  }
}
