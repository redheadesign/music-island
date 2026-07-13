const port = Number(process.argv[2] || 9333)
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())
const target = targets
  .filter((entry) => entry.type === 'page' && entry.url.includes('tauri.localhost'))
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
    const timeout = setTimeout(() => reject(new Error(`${method} timed out`)), 5_000)
    const onMessage = (event) => {
      const payload = JSON.parse(event.data)
      if (payload.id !== id) return
      clearTimeout(timeout)
      socket.removeEventListener('message', onMessage)
      resolve(payload)
    }
    socket.addEventListener('message', onMessage)
    socket.send(JSON.stringify({ id, method, params }))
  })

const expression = `(() => {
  const action = document.querySelector('.island-actions');
  const buttons = [...(action?.querySelectorAll('button') || [])];
  const button = buttons[0];
  const inspect = (element) => {
    if (!element) return null;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName,
      className: String(element.className || ''),
      pointerEvents: style.pointerEvents,
      visibility: style.visibility,
      opacity: style.opacity,
      zIndex: style.zIndex,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  };
  const rect = button?.getBoundingClientRect();
  const hit = rect ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) : null;
  const chain = [];
  for (let current = button; current; current = current.parentElement) chain.push(inspect(current));
  return {
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight },
    action: inspect(action),
    button: inspect(button),
    buttons: buttons.map((candidate) => {
      const candidateRect = candidate.getBoundingClientRect();
      const candidateHit = document.elementFromPoint(
        candidateRect.x + candidateRect.width / 2,
        candidateRect.y + candidateRect.height / 2,
      );
      return {
        label: candidate.getAttribute('aria-label'),
        button: inspect(candidate),
        hit: inspect(candidateHit),
        hitMatchesButton: candidateHit === candidate || candidate.contains(candidateHit),
      };
    }),
    hit: inspect(hit),
    hitMatchesButton: !!button && (hit === button || button.contains(hit)),
    chain,
  };
})()`

const response = await call('Runtime.evaluate', { expression, returnByValue: true })
const button = response.result.result.value.button
if (button) {
  await call('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: button.rect.x + button.rect.width / 2,
    y: button.rect.y + button.rect.height / 2,
  })
  await new Promise((resolve) => setTimeout(resolve, 250))
}
const hoverResponse = await call('Runtime.evaluate', {
  expression: `(() => {
    const button = document.querySelector('.island-actions button');
    const icon = button?.querySelector('svg');
    return {
      buttonHovered: button?.matches(':hover') ?? false,
      actionHovered: document.querySelector('.island-actions')?.matches(':hover') ?? false,
      backgroundColor: button ? getComputedStyle(button).backgroundColor : null,
      iconOpacity: icon ? getComputedStyle(icon).opacity : null,
    };
  })()`,
  returnByValue: true,
})

socket.close()
console.log(JSON.stringify({
  ...response.result.result.value,
  hover: hoverResponse.result.result.value,
}, null, 2))
