import { exportReleaseScene } from './exportReleaseScene'

export async function saveReleaseImage(node: HTMLElement, kind: 'readme' | 'telegram' | 'frame' | 'poster', id: string, cached?: string) {
  const url = cached ?? await exportReleaseScene(node, kind === 'readme' ? 2 : 1)
  const png = await (await fetch(url)).blob()
  const response = await fetch(`http://127.0.0.1:6010/${kind}/${id}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png })
  if (!response.ok) throw new Error(await response.text())
  return url
}

export async function settleReleaseFrame(node: HTMLElement, layoutChanged = true) {
  await document.fonts.ready
  for (const video of node.querySelectorAll<HTMLVideoElement>('video[data-export-video]')) {
    if (video.readyState < 1) await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { cleanup(); reject(new Error('Video frame did not load')) }, 15000)
      const cleanup = () => { clearTimeout(timer); video.removeEventListener('loadedmetadata', ready); video.removeEventListener('error', failed) }
      const ready = () => { cleanup(); resolve() }
      const failed = () => { cleanup(); reject(new Error('Missing generated video')) }
      video.addEventListener('loadedmetadata', ready, { once: true }); video.addEventListener('error', failed, { once: true })
    })
    const target = Number(video.dataset.frameTime)
    // During seek readyState may fall to HAVE_METADATA; loadeddata is not fired
    // again. seeked, rather than the initial load event, owns subsequent frames.
    if (Math.abs(video.currentTime - target) > .001 || video.seeking || video.readyState < 2) await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { video.removeEventListener('seeked', ready); reject(new Error('Video seek timed out')) }, 15000)
      const ready = () => { clearTimeout(timer); resolve() }
      video.addEventListener('seeked', ready, { once: true })
      video.currentTime = target
    })
  }
  await Promise.all(Array.from(node.querySelectorAll('img')).map(img => img.decode().catch(() => {})))
  // New scenes need ResizeObserver delivery; subsequent frames already have
  // stable layout and Paper's explicit setFrame renders synchronously.
  if (layoutChanged) await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  else await new Promise<void>(resolve => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve() }
    channel.port2.postMessage(null)
  })
}
