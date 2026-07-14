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
  const relevant = /play|pause|like|dislike|track|time|player|next|prev|cover|wave|vibe|rotor|station|preset|context|selection|filter|mood|genre|diversity/i;
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
  const playerRoot = document.querySelector("[data-test-id='VIBE_PLAYERBAR']");
  const playerTitleRoot = playerRoot?.querySelector("[data-test-id='VIBE_PLAYERBAR_TRACK_NAME']");
  const playerTitleNode = playerTitleRoot?.querySelector(":scope > :not([aria-hidden='true'])") || playerTitleRoot;
  const playerTitleCopy = playerTitleNode?.cloneNode(true);
  playerTitleCopy?.querySelectorAll("[class*='artists'],[data-test-id='SEPARATED_ARTIST_TITLE']")
    .forEach((element) => element.remove());
  const playerArtist = playerRoot?.querySelector(
    "[data-test-id='SEPARATED_ARTIST_TITLE'],[class*='PlayerBarTitle_artist'],[data-test-id='VIBE_PLAYERBAR_TRACK_NAME'] [class*='artists']",
  );
  const waveCandidates = [...document.querySelectorAll('[data-test-id], button, [role="option"], [role="tab"], a')]
    .map((element) => ({
      tag: element.tagName,
      testId: element.getAttribute('data-test-id'),
      ariaLabel: element.getAttribute('aria-label'),
      role: element.getAttribute('role'),
      href: element.getAttribute('href'),
      pressed: element.getAttribute('aria-pressed'),
      selected: element.getAttribute('aria-selected'),
      text: String(element.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 120),
      className: String(element.className || '').slice(0, 180),
      image: element.querySelector('img')?.src || null,
      data: Object.fromEntries(
        [...element.attributes]
          .filter((attribute) => attribute.name.startsWith('data-'))
          .map((attribute) => [attribute.name, attribute.value]),
      ),
      link: element.closest('a')?.href || element.querySelector('a')?.href || null,
      html: element.getAttribute('data-test-id') === 'WHEEL_VIBE_ITEM'
        ? element.outerHTML.slice(0, 1800)
        : null,
    }))
    .filter((candidate) => relevant.test(JSON.stringify(candidate)))
    .slice(0, 250);
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
    playerTitle: playerTitleCopy?.textContent?.trim() || null,
    playerArtist: playerArtist?.textContent?.replace(/\\s*[—–-]\\s*$/, '')?.trim() || null,
    controls,
    waveCandidates,
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
const value = result.result.result.value
if (process.argv.includes('--summary')) {
  console.log(JSON.stringify({
    title: value.title,
    playerTitle: value.playerTitle,
    playerArtist: value.playerArtist,
    reset: value.controls.find((control) => control.testId === 'RESET_VIBE_CONTEXT_BUTTON') || null,
    presets: value.waveCandidates
      .filter((candidate) => candidate.testId === 'WHEEL_VIBE_ITEM')
      .map((candidate) => ({
        id: candidate.data['data-intersection-property-id'],
        title: candidate.text,
        iconUrl: candidate.image,
      }))
      .filter((preset, index, presets) => (
        preset.id && presets.findIndex((candidate) => candidate.id === preset.id) === index
      )),
  }, null, 2))
} else {
  console.log(JSON.stringify(value, null, 2))
}
