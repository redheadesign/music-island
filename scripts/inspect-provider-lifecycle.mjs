const port = Number(process.argv[2] || 9333)
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())

async function evaluate(target, expression, awaitPromise = false) {
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  const payload = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP evaluate timed out')), 8_000)
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== 1) return
      clearTimeout(timer)
      resolve(message)
    })
    socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise, returnByValue: true },
    }))
  })
  socket.close()
  return payload.result.result.value
}

const pages = targets.filter((target) => target.type === 'page' && target.url.includes('localhost'))
const classified = await Promise.all(pages.map(async (target) => ({
  target,
  overlay: await evaluate(target, `Boolean(document.querySelector('.island-root'))`),
})))
const overlay = classified.find((entry) => entry.overlay)?.target
if (!overlay) throw new Error('Overlay target was not found')

const value = await evaluate(overlay, `(async () => {
  const [snapshot, status] = await Promise.all([
    window.__TAURI_INTERNALS__.invoke('get_media_snapshot'),
    window.__TAURI_INTERNALS__.invoke('get_direct_yandex_status'),
  ]);
  return {
    snapshot: {
      provider: snapshot.provider,
      hasSession: snapshot.hasSession,
      title: snapshot.title,
    },
    status,
    ui: {
      text: document.querySelector('.music-module')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      oldTrackVisible: Boolean(document.querySelector('.progress-content--track')),
    },
  };
})()`, true)

console.log(JSON.stringify(value, null, 2))
