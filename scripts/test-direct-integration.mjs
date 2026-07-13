const port = Number(process.argv[2] || 9333)
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())
const pages = targets.filter((target) => target.type === 'page' && target.url.includes('tauri.localhost'))
if (!pages.length) throw new Error('Music Island WebView targets not found')

async function connect(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let id = 0
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const requestId = ++id
      const timeout = setTimeout(() => reject(new Error(`${method} timed out`)), 45_000)
      const onMessage = (event) => {
        const payload = JSON.parse(event.data)
        if (payload.id !== requestId) return
        clearTimeout(timeout)
        socket.removeEventListener('message', onMessage)
        resolve(payload)
      }
      socket.addEventListener('message', onMessage)
      socket.send(JSON.stringify({ id: requestId, method, params }))
    })
  return { socket, call }
}

const connections = await Promise.all(pages.map(async (target) => {
  const connection = await connect(target)
  const viewport = await connection.call('Runtime.evaluate', {
    expression: '({ width: innerWidth, height: innerHeight })',
    returnByValue: true,
  })
  return { ...connection, target, viewport: viewport.result.result.value }
}))

const main = connections.sort((a, b) => a.viewport.width - b.viewport.width)[0]
const originalConfigResponse = await main.call('Runtime.evaluate', {
  expression: `window.__TAURI_INTERNALS__.invoke('get_config')`,
  awaitPromise: true,
  returnByValue: true,
})
const originalConfig = originalConfigResponse.result.result.value
await main.call('Runtime.evaluate', {
  expression: `window.__TAURI_INTERNALS__.invoke('save_config', {
    config: ${JSON.stringify({
      ...originalConfig,
      behavior: { ...originalConfig.behavior, pinExpanded: true },
    })}
  })`,
  awaitPromise: true,
  returnByValue: true,
})
const enabled = await main.call('Runtime.evaluate', {
  expression: `window.__TAURI_INTERNALS__.invoke('enable_direct_yandex')`,
  awaitPromise: true,
  returnByValue: true,
})
if (enabled.exceptionDetails) {
  throw new Error(enabled.exceptionDetails.exception?.description || enabled.exceptionDetails.text)
}

await new Promise((resolve) => setTimeout(resolve, 2_000))
const snapshot = await main.call('Runtime.evaluate', {
  expression: `window.__TAURI_INTERNALS__.invoke('get_media_snapshot')`,
  awaitPromise: true,
  returnByValue: true,
})
const initialSnapshot = snapshot.result.result.value
await main.call('Runtime.evaluate', {
  expression: `window.__TAURI_INTERNALS__.invoke('media_control', { command: 'like' })`,
  awaitPromise: true,
  returnByValue: true,
})
await new Promise((resolve) => setTimeout(resolve, 1_000))
const toggledSnapshot = await main.call('Runtime.evaluate', {
  expression: `window.__TAURI_INTERNALS__.invoke('get_media_snapshot')`,
  awaitPromise: true,
  returnByValue: true,
})
await main.call('Runtime.evaluate', {
  expression: `window.__TAURI_INTERNALS__.invoke('media_control', { command: 'like' })`,
  awaitPromise: true,
  returnByValue: true,
})
await new Promise((resolve) => setTimeout(resolve, 1_000))
const restoredSnapshot = await main.call('Runtime.evaluate', {
  expression: `window.__TAURI_INTERNALS__.invoke('get_media_snapshot')`,
  awaitPromise: true,
  returnByValue: true,
})
const controls = await main.call('Runtime.evaluate', {
  expression: `(() => [...document.querySelectorAll('.reaction-button')].map((button) => ({
    label: button.getAttribute('aria-label'),
    pressed: button.getAttribute('aria-pressed'),
    disabled: button.disabled,
  })))()`,
  returnByValue: true,
})
await main.call('Runtime.evaluate', {
  expression: `window.__TAURI_INTERNALS__.invoke('save_config', {
    config: ${JSON.stringify(originalConfig)}
  })`,
  awaitPromise: true,
  returnByValue: true,
})

for (const connection of connections) connection.socket.close()
console.log(JSON.stringify({
  status: enabled.result.result.value,
  snapshot: initialSnapshot,
  likeRoundTrip: {
    before: initialSnapshot.isLiked,
    afterToggle: toggledSnapshot.result.result.value.isLiked,
    afterRestore: restoredSnapshot.result.result.value.isLiked,
  },
  reactionButtons: controls.result.result.value,
}, null, 2))
