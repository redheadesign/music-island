const port = Number(process.argv[2] || 9333)
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json())
const pages = targets.filter((target) => target.type === 'page' && target.url.includes('localhost'))

async function evaluate(target, expression, awaitPromise = false) {
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  const response = await new Promise((resolve, reject) => {
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
      params: { expression, awaitPromise, returnByValue: true },
    }))
  })
  socket.close()
  if (response.error) throw new Error(JSON.stringify(response.error))
  if (response.result?.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.text || 'Runtime.evaluate failed')
  }
  return response.result.result.value
}

const contexts = await Promise.all(pages.map(async (target) => ({
  target,
  kind: await evaluate(target, `document.querySelector('.island-root') ? 'overlay' : document.querySelector('.settings-window-root') ? 'settings' : 'unknown'`),
})))
const overlay = contexts.find((context) => context.kind === 'overlay')?.target
const settings = contexts.find((context) => context.kind === 'settings')?.target
if (!overlay || !settings) throw new Error('Overlay/settings WebView targets were not found')

const [snapshot, catalog, settingsUi] = await Promise.all([
  evaluate(overlay, `window.__TAURI_INTERNALS__.invoke('get_media_snapshot')`, true),
  evaluate(overlay, `window.__TAURI_INTERNALS__.invoke('list_yandex_wave_presets')`, true),
  evaluate(settings, `(() => {
    const titlebar = document.querySelector('.settings-titlebar');
    const actions = [...document.querySelectorAll('.settings-window-actions button')];
    const hitTargets = actions.map((button) => {
      const rect = button.getBoundingClientRect();
      return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest('button') === button;
    });
    const hero = document.querySelector('.settings-hero');
    const scroll = document.querySelector('.settings-scroll');
    return {
      heading: hero?.textContent?.trim(),
      subtitlePresent: Boolean(hero?.querySelector('p, .settings-eyebrow')),
      actionHitTargets: hitTargets,
      titlebarBackground: getComputedStyle(titlebar).backgroundColor,
      scrollBackgroundImage: getComputedStyle(scroll).backgroundImage,
      sectionBorders: [...document.querySelectorAll('.settings-section')]
        .map((section) => getComputedStyle(section).borderTopWidth),
    };
  })()`),
])

console.log(JSON.stringify({
  media: {
    provider: snapshot.provider,
    hasSession: snapshot.hasSession,
    title: snapshot.title,
    artist: snapshot.artist,
    liked: snapshot.isLiked,
    activeWaveTitle: snapshot.activeWaveTitle,
  },
  wave: {
    supported: catalog.supported,
    count: catalog.presets.length,
    uniqueTitles: new Set(catalog.presets.map((preset) => preset.title)).size,
    hasIcons: catalog.presets.some((preset) => Boolean(preset.iconUrl)),
  },
  settings: settingsUi,
}, null, 2))
