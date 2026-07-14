const port = Number(process.argv[2] || 9333)
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())

async function evaluate(target, expression) {
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  const response = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP evaluate timed out')), 20_000)
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== 1) return
      clearTimeout(timer)
      resolve(message)
    })
    socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }))
  })
  socket.close()
  if (response.result.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.exception?.description || 'Evaluation failed')
  }
  return response.result.result.value
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
  const catalog = await window.__TAURI_INTERNALS__.invoke('list_yandex_wave_presets');
  const preset = catalog.presets.find((item) => item.title === 'Хочется инди') || catalog.presets[0];
  if (!catalog.supported || !preset) return { catalog, skipped: true };
  const selected = await window.__TAURI_INTERNALS__.invoke('select_yandex_wave_preset', { id: preset.id });
  await sleep(1800);
  const active = await window.__TAURI_INTERNALS__.invoke('get_media_snapshot');
  const cleared = await window.__TAURI_INTERNALS__.invoke('clear_yandex_wave_selection');
  await sleep(1800);
  const afterClear = await window.__TAURI_INTERNALS__.invoke('get_media_snapshot');
  return {
    catalog: { supported: catalog.supported, count: catalog.presets.length },
    preset: { id: preset.id, title: preset.title },
    selected,
    active: { id: active.activeWaveId, title: active.activeWaveTitle },
    cleared,
    afterClear: { id: afterClear.activeWaveId, title: afterClear.activeWaveTitle },
  };
})()`)

console.log(JSON.stringify(result, null, 2))
