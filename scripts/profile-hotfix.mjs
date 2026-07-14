const port = Number(process.argv[2] || 9333)
const switchCount = Number(process.argv[3] || 10)
const holdSeconds = Number(process.argv[4] || 0)
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())
const target = targets
  .filter((entry) => entry.type === 'page'
    && (entry.url.includes('tauri.localhost') || entry.url.includes('localhost')))
  .at(-1)
if (!target) throw new Error('Music Island WebView target not found')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

let requestId = 0
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++requestId
    const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 10_000)
    const onMessage = (event) => {
      const payload = JSON.parse(event.data)
      if (payload.id !== id) return
      clearTimeout(timer)
      socket.removeEventListener('message', onMessage)
      if (payload.error) reject(new Error(JSON.stringify(payload.error)))
      else resolve(payload.result)
    }
    socket.addEventListener('message', onMessage)
    socket.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async (expression) => {
  const result = await call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

const invoke = (command, args = {}) =>
  evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)}, ${JSON.stringify(args)})`)

const waitFor = async (probe, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await probe()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('condition timed out')
}

const originalConfig = await invoke('get_config')
const pinnedConfig = {
  ...originalConfig,
  behavior: { ...originalConfig.behavior, pinExpanded: true },
}

try {
  await invoke('save_config', { config: pinnedConfig })
  await waitFor(() => evaluate(`Boolean(document.querySelector(".island-expanded-layer"))`))
  if (holdSeconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, holdSeconds * 1_000))
  }

  const latencies = []
  for (let index = 0; index < switchCount; index += 1) {
    const before = await evaluate(`document.querySelector(".progress-content--track")?.textContent || ""`)
    const startedAt = performance.now()
    const clicked = await evaluate(`(() => {
      const button = document.querySelector("button[aria-label='Next']");
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`)
    if (!clicked) throw new Error('Next button is unavailable')
    await waitFor(async () => {
      const title = await evaluate(`document.querySelector(".progress-content--track")?.textContent || ""`)
      return title && title !== before
    })
    latencies.push(Math.round(performance.now() - startedAt))
  }

  const diagnostics = JSON.parse(await invoke('copy_diagnostics'))
  const reactionOrder = await evaluate(
    `[...document.querySelectorAll(".progress-row > button")].map((button) => button.getAttribute("aria-label"))`,
  )
  if (
    reactionOrder.length === 3
    && (!reactionOrder[0]?.includes('нравится') || reactionOrder[1] !== 'Seek track' || !reactionOrder[2]?.includes('любим'))
  ) {
    throw new Error(`unexpected reaction control order: ${reactionOrder.join(' | ')}`)
  }
  const sorted = [...latencies].sort((left, right) => left - right)
  const p95 = sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
    : null
  console.log(JSON.stringify({
    switches: switchCount,
    reactionOrder,
    overlayUpdateLatencyMs: {
      values: latencies,
      average: latencies.length
        ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
        : null,
      p95,
      maximum: latencies.length ? Math.max(...latencies) : null,
    },
    metrics: {
      media: diagnostics.mediaMetrics,
      direct: diagnostics.directMetrics,
      window: diagnostics.windowMetrics,
    },
  }, null, 2))
} finally {
  await invoke('save_config', { config: originalConfig }).catch(() => undefined)
  socket.close()
}
