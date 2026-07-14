const port = Number(process.argv[2] || 9444)
const durationMs = Number(process.argv[3] || 10_000)
const preservePinnedState = process.argv.includes('--already-pinned')
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())

async function evaluate(target, expression, awaitPromise = false) {
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  const payload = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP evaluate timed out')), durationMs + 8_000)
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

const result = await evaluate(overlay, `(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const original = await window.__TAURI_INTERNALS__.invoke('get_config');
  if (!${preservePinnedState}) {
    await window.__TAURI_INTERNALS__.invoke('save_config', {
      config: { ...original, behavior: { ...original.behavior, pinExpanded: true } },
    });
  }
  for (let waited = 0; waited < 3000 && !document.querySelector('.wave-wheel'); waited += 50) {
    await sleep(50);
  }
  const wheel = document.querySelector('.wave-wheel');
  if (!wheel) throw new Error('Wave wheel is unavailable');
  const started = performance.now();
  let events = 0;
  while (performance.now() - started < ${durationMs}) {
    wheel.dispatchEvent(new WheelEvent('wheel', {
      deltaY: events % 2 === 0 ? 28 : -24,
      bubbles: true,
      cancelable: true,
    }));
    events += 1;
    await sleep(16);
  }
  await sleep(250);
  const mountedItems = wheel.querySelectorAll('.wave-wheel__item').length;
  if (!${preservePinnedState}) {
    await window.__TAURI_INTERNALS__.invoke('save_config', { config: original });
  }
  return { events, mountedItems };
})()`, true)

console.log(JSON.stringify(result))
