const port = Number(process.argv[2] || 8288)
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())
const target = targets.find(
  (entry) => entry.type === 'page' && entry.url.startsWith('music-application://'),
)
if (!target) throw new Error('Yandex Music renderer target not found')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

const result = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('CDP evaluate timed out')), 8_000)
  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data)
    if (payload.id !== 1) return
    clearTimeout(timer)
    resolve(payload)
  })
  socket.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(async () => {
        document.querySelector("[data-test-id='VIBE_CONTEXT_MENU_BUTTON']")?.click();
        await new Promise((resolve) => setTimeout(resolve, 500));
        const candidates = [...document.querySelectorAll("[role='dialog'] button,[role='menu'] button,[data-test-id*='VIBE'] button")]
          .map((button) => ({
            testId: button.getAttribute('data-test-id'),
            ariaLabel: button.getAttribute('aria-label'),
            pressed: button.getAttribute('aria-pressed'),
            text: String(button.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 120),
          }))
          .filter((candidate) => candidate.text || candidate.ariaLabel);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return candidates;
      })()`,
      awaitPromise: true,
      returnByValue: true,
    },
  }))
})
socket.close()
if (result.error) throw new Error(JSON.stringify(result.error))
console.log(JSON.stringify(result.result.result.value, null, 2))
