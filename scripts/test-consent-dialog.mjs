const port = Number(process.argv[2] || 9333)
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())
const pages = targets.filter((target) => target.type === 'page' && target.url.includes('tauri.localhost'))

async function evaluate(target, expression, awaitPromise = false) {
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP evaluate timed out')), 5_000)
    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data)
      if (payload.id !== 1) return
      clearTimeout(timeout)
      resolve(payload)
    })
    socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise, returnByValue: true },
    }))
  })
  socket.close()
  return result.result.result.value
}

const dimensions = await Promise.all(
  pages.map(async (target) => ({
    target,
    viewport: await evaluate(target, '({ width: innerWidth, height: innerHeight })'),
  })),
)
dimensions.sort((a, b) => a.viewport.width - b.viewport.width)
await evaluate(
  dimensions[0].target,
  `window.__TAURI_INTERNALS__.invoke('open_settings_window')`,
  true,
)
const settings = dimensions.at(-1)
await evaluate(
  settings.target,
  `(() => {
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => candidate.textContent.trim() === 'Подключить');
    if (!button) throw new Error('Connect button not found');
    button.click();
    return true;
  })()`,
)
await new Promise((resolve) => setTimeout(resolve, 250))
const geometry = await evaluate(
  settings.target,
  `(() => {
    const backdrop = document.querySelector('.consent-backdrop');
    const dialog = document.querySelector('.consent-dialog');
    const backdropRect = backdrop.getBoundingClientRect();
    const dialogRect = dialog.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      parent: backdrop.parentElement.tagName,
      scrollTop: document.querySelector('.settings-scroll').scrollTop,
      backdrop: { x: backdropRect.x, y: backdropRect.y, width: backdropRect.width, height: backdropRect.height },
      dialog: { x: dialogRect.x, y: dialogRect.y, width: dialogRect.width, height: dialogRect.height },
      centerDelta: {
        x: dialogRect.x + dialogRect.width / 2 - innerWidth / 2,
        y: dialogRect.y + dialogRect.height / 2 - innerHeight / 2,
      },
    };
  })()`,
)

console.log(JSON.stringify(geometry, null, 2))
