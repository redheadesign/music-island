const port = Number(process.argv[2] || 9333)
const action = process.argv[3] || 'open'
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
  kind: await evaluate(target, `document.querySelector('.island-root') ? 'overlay' : document.querySelector('.settings-window-root') ? 'settings' : 'unknown'`),
})))
const overlay = classified.find((entry) => entry.kind === 'overlay')?.target
const settings = classified.find((entry) => entry.kind === 'settings')?.target
if (!overlay || !settings) throw new Error('Overlay/settings targets were not found')

if (action === 'open') {
  await evaluate(overlay, `window.__TAURI_INTERNALS__.invoke('open_settings_window')`, true)
} else {
  const label = action === 'minimize' ? 'Свернуть' : 'Закрыть'
  const clicked = await evaluate(
    settings,
    `(() => { const button=document.querySelector("button[aria-label='${label}']"); if(!button)return false; button.click(); return true; })()`,
  )
  if (!clicked) throw new Error(`${label} button was not found`)
}
console.log(JSON.stringify({ action, ok: true }))
