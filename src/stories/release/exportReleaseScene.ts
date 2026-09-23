import { getFontEmbedCSS, toSvg } from 'html-to-image'

let fontCSS: Promise<string> | undefined
const stills = new Map<string, string>()

/** Export only the composed scene. Native mocks and image tooling stay in Storybook. */
export async function exportReleaseScene(node: HTMLElement, pixelRatio = 1) {
  const restore: Array<() => void> = []
  try {
    for (const video of node.querySelectorAll<HTMLVideoElement>('video[data-export-video]')) {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      if (!canvas.width || video.readyState < 2) throw new Error('Generated video has no decoded frame')
      canvas.getContext('2d')!.drawImage(video, 0, 0)
      const snapshot = new Image()
      snapshot.src = canvas.toDataURL('image/png')
      const style = getComputedStyle(video)
      for (const property of style) snapshot.style.setProperty(property, style.getPropertyValue(property))
      await snapshot.decode()
      // Keep the decoder attached. Removing/reinserting a <video> can restart
      // resource selection and lose loadeddata in a background export tab.
      video.before(snapshot)
      restore.push(() => snapshot.remove())
    }
    // Freeze explicitly marked, static production UI once. The wipe still moves
    // on every frame without serializing thousands of unchanged DOM nodes again.
    for (const child of node.querySelectorAll<HTMLElement>('[data-export-still]')) {
      const key = `${child.dataset.exportStill}:${child.offsetWidth}:${child.offsetHeight}`
      let png = stills.get(key)
      if (!png) {
        png = await exportReleaseScene(child)
        stills.set(key, png)
      }
      const snapshot = new Image()
      snapshot.src = png
      snapshot.className = child.className
      snapshot.width = child.offsetWidth
      snapshot.height = child.offsetHeight
      const style = getComputedStyle(child)
      for (const property of style) snapshot.style.setProperty(property, style.getPropertyValue(property))
      await snapshot.decode()
      child.replaceWith(snapshot)
      restore.push(() => snapshot.replaceWith(child))
    }
    // Presentation copy omits terminal periods, including short production hints.
    // Restore every text node after the snapshot; app copy is never changed here.
    for (const paragraph of node.querySelectorAll('p, small, h1, h2, h3, h4')) {
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)
      let last: Text | undefined
      while (walker.nextNode()) if (walker.currentNode.textContent?.trim()) last = walker.currentNode as Text
      if (!last || !/\.$/.test(last.data.trimEnd())) continue
      const text = last, previous = text.data
      text.data = previous.replace(/\.(\s*)$/, '$1')
      restore.push(() => { text.data = previous })
    }
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
      // Clone a normal image, avoiding html-to-image's per-canvas RAF wait in
      // background tabs. The live canvas is restored before React updates.
      const snapshot = new Image()
      snapshot.src = data
      snapshot.width = canvas.width
      snapshot.height = canvas.height
      const canvasStyle = getComputedStyle(canvas)
      for (const property of canvasStyle) snapshot.style.setProperty(property, canvasStyle.getPropertyValue(property))
      canvas.replaceWith(snapshot)
      restore.push(() => snapshot.replaceWith(canvas))
    }
    await document.fonts.ready
    fontCSS ??= getFontEmbedCSS(node)
    const svg = await toSvg(node, { cacheBust: false, fontEmbedCSS: await fontCSS, filter: child => !(child instanceof HTMLVideoElement && child.hasAttribute('data-export-video')) })
    const image = new Image()
    image.src = svg
    await image.decode()
    const output = document.createElement('canvas')
    output.width = node.offsetWidth * pixelRatio
    output.height = node.offsetHeight * pixelRatio
    output.getContext('2d')!.drawImage(image, 0, 0, output.width, output.height)
    return output.toDataURL('image/png')
  } finally {
    for (const reset of restore.reverse()) reset()
  }
}
