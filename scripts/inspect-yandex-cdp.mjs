const port = Number(process.argv[2] || 9222)
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

const expression = `(() => {
  const relevant = /play|pause|like|dislike|track|time|player|next|prev|cover/i;
  const testIds = [...document.querySelectorAll('[data-test-id]')]
    .map((element) => element.getAttribute('data-test-id'))
    .filter((value) => value && relevant.test(value));
  const controls = [...document.querySelectorAll('button')]
    .map((button) => ({
      testId: button.getAttribute('data-test-id'),
      ariaLabel: button.getAttribute('aria-label'),
      title: button.getAttribute('title'),
      className: String(button.className || '').slice(0, 180),
      pressed: button.getAttribute('aria-pressed'),
      text: String(button.textContent || '').trim().slice(0, 80),
    }))
    .filter((button) => relevant.test(JSON.stringify(button)));
  return {
    title: document.title,
    readyState: document.readyState,
    testIds: [...new Set(testIds)].sort(),
    timecodeHtml: document.querySelector("[data-test-id='VIBE_PLAYERBAR_TIMECODE']")?.outerHTML.slice(0, 1200) || null,
    sliderHtml: document.querySelector("[data-test-id='VIBE_PLAYERBAR_TIMECODE_SLIDER']")?.outerHTML.slice(0, 1200) || null,
    sliderInput: (() => {
      const input = document.querySelector("[data-test-id='VIBE_PLAYERBAR_TIMECODE_SLIDER'] input");
      return input ? {
        value: input.value,
        min: input.min,
        max: input.max,
        step: input.step,
        type: input.type,
      } : null;
    })(),
    artist: document.querySelector("[data-test-id='SEPARATED_ARTIST_TITLE']")?.textContent?.trim() || null,
    controls,
  };
})()`

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
    params: { expression, returnByValue: true },
  }))
})

socket.close()
if (result.error) throw new Error(JSON.stringify(result.error))
console.log(JSON.stringify(result.result.result.value, null, 2))
