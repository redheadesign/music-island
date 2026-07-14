const port = Number(process.argv[2] || 9333)
const reducedMotion = process.argv.includes('--reduced')
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())

async function evaluate(target, expression, awaitPromise = false) {
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  const payload = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP evaluate timed out')), 10_000)
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
  const collapsed = {
    ...original,
    appearance: { ...original.appearance, reducedMotion: ${reducedMotion} },
    behavior: { ...original.behavior, pinExpanded: false },
  };
  await window.__TAURI_INTERNALS__.invoke('save_config', { config: collapsed });
  await sleep(Math.max(450, collapsed.behavior.autoCollapseMs + 350));
  const initialHeight = innerHeight;
  const mounted = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      observer.disconnect();
      reject(new Error('expanded layer did not mount'));
    }, 4000);
    const observer = new MutationObserver(() => {
      const layer = document.querySelector('.island-expanded-layer');
      if (!layer) return;
      clearTimeout(timeout);
      observer.disconnect();
      const sampleMotion = () => {
        const hoverZone = document.querySelector('.island-hover-zone');
        const style = hoverZone ? getComputedStyle(hoverZone) : null;
        const matrix = style?.transform && style.transform !== 'none'
          ? new DOMMatrixReadOnly(style.transform)
          : null;
        return {
          opacity: Number(style?.opacity ?? 0),
          translateY: matrix?.m42 ?? 0,
        };
      };
      const initialMotion = sampleMotion();
      requestAnimationFrame(() => {
        const firstPaintMotion = sampleMotion();
        setTimeout(() => {
          const midMotion = sampleMotion();
          setTimeout(() => {
            const card = document.querySelector('.island-card')?.getBoundingClientRect();
            resolve({
              mountedHeight: innerHeight,
              rootClass: document.querySelector('.island-root')?.className,
              cardBottom: card?.bottom || 0,
              clipped: Boolean(card && card.bottom > innerHeight),
              motion: {
                initial: initialMotion,
                firstPaint: firstPaintMotion,
                mid: midMotion,
                end: sampleMotion(),
              },
            });
          }, 220);
        }, 80);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await window.__TAURI_INTERNALS__.invoke('save_config', {
    config: { ...collapsed, behavior: { ...collapsed.behavior, pinExpanded: true } },
  });
  const expanded = await mounted;
  await window.__TAURI_INTERNALS__.invoke('save_config', { config: original });
  return { initialHeight, ...expanded };
})()`, true)

console.log(JSON.stringify(result, null, 2))
