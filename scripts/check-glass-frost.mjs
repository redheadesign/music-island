import assert from 'node:assert/strict'
import sharp from 'sharp'

// Exercise Chromium's actual backdrop compositing. An opaque plate or a tinted
// sheet with no blur can both have a plausible computed backdrop-filter.
export async function checkGlassFrost(page) {
  const stage = page.locator('.workshop-stage')
  const originalStyle = await stage.getAttribute('style')
  const card = await page.locator('.island-card').boundingBox()
  assert.ok(card, 'Expected the expanded island card')
  // A patch inside the upper left of the card, clear of its buttons and artwork.
  const clip = { x: Math.floor(card.x + card.width * .14), y: Math.floor(card.y + card.height * .12), width: 28, height: 6 }
  const still = await page.addStyleTag({ content: '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; }' })
  async function sample(background) {
    await stage.evaluate((element, value) => element.style.setProperty('background', value, 'important'), background)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    return sharp(await page.screenshot({ clip })).removeAlpha().raw().toBuffer()
  }
  function difference(a, b) {
    return a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length
  }
  try {
    const light = '#e1e1e1', dark = '#1e1e1e'
    const stripes = (a, b) => `repeating-linear-gradient(90deg, ${a} 0 2px, ${b} 2px 4px)`
    const broad = difference(await sample(light), await sample(dark))
    const fine = difference(await sample(stripes(light, dark)), await sample(stripes(dark, light)))
    assert.ok(broad > 8, `Island hides the backdrop (broad contrast ${broad.toFixed(1)} / 255)`)
    assert.ok(fine < broad * .55, `Fine background detail remains sharp (${fine.toFixed(1)} vs ${broad.toFixed(1)})`)
  } finally {
    await stage.evaluate((el, style) => {
      if (style === null) el.removeAttribute('style')
      else el.setAttribute('style', style)
    }, originalStyle)
    await still.evaluate(el => el.remove())
  }
}

// Measure each widget's actual desktop transmission, including any ancestor
// fills. Text covers some pixels, so compare the median in the centre.
export async function checkIslandWidgetTransmission(page) {
  const widgets = [
    ['.usage-chip__compact-provider', '.usage-chip__compact-value'],
    ['.island-local-servers', '.island-local-servers__address span'],
    ['.island-latest-dictation', '.island-latest-dictation__text'],
  ]
  const areas = await Promise.all(widgets.map(async ([selector, text]) => {
    const element = page.locator(selector).first()
    const widget = await element.boundingBox()
    assert.ok(widget, `Missing visible ${selector}`)
    const crop = {
      left: Math.ceil(widget.x + widget.width * .15), top: Math.ceil(widget.y + widget.height * .2),
      width: Math.floor(widget.width * .7), height: Math.floor(widget.height * .6),
    }
    return { selector, text: element.locator(text).first(), crop }
  }))
  const style = await page.addStyleTag({ content: '.workshop-stage { background: #000 !important }' })
  async function capture(css, background) {
    await style.evaluate((el, rules) => { el.textContent = rules }, css + `.workshop-stage { background: ${background} !important }`)
    return page.screenshot()
  }
  try {
    const defaults = []
    for (const [strength, min, max] of [[null, .25, .55], [0, 0, .01], [1, .36, .48]]) {
      const css = strength === null ? '' : `.island-root { --glass-transparency-strength: ${strength} !important; --glass-highlight-strength: 1 !important }`
      const dark = await capture(css, '#000'), light = await capture(css, '#fff')
      for (const { selector, text, crop } of areas) {
        const patches = await Promise.all([dark, light].map(frame => sharp(frame).extract(crop).removeAlpha().greyscale().raw().toBuffer()))
        const differences = patches[1].map((value, index) => Math.abs(value - patches[0][index])).sort()
        const transmitted = differences[Math.floor(differences.length / 2)] / 255
        assert.ok(transmitted >= min && transmitted <= max, `${selector} transmitted ${Math.round(transmitted * 100)}% at ${strength ?? 'default'}`)
        if (strength === null) defaults.push(transmitted)
        if (strength === 1) {
          const plate = patches[1].sort()[Math.floor(patches[1].length / 2)]
          const ink = (await text.evaluate(el => getComputedStyle(el).color)).match(/[\d.]+/g).map(Number)
          const contrast = (luminance(ink.slice(0, 3)) + .05) / (luminance([plate, plate, plate]) + .05)
          assert.ok(contrast >= 4.5, `${selector} text on white backdrop: ${contrast.toFixed(2)}:1`)
        }
      }
    }
    // In each independent silhouette, frost must actually suppress fine
    // desktop detail even while its transmission and text remain unchanged.
    const stripes = first => `repeating-linear-gradient(90deg, ${first ? '#fff' : '#000'} 0 2px, ${first ? '#000' : '#fff'} 2px 4px)`
    let clearDetail
    for (const filter of ['none', 'blur(32px) saturate(1.15)']) {
      const css = `.island-root { --glass-user-filter: ${filter} !important }`
      const a = await capture(css, stripes(true)), b = await capture(css, stripes(false))
      const detail = await Promise.all(areas.map(async ({ crop }) => {
        const [first, second] = await Promise.all([a, b].map(frame => sharp(frame).extract(crop).greyscale().raw().toBuffer()))
        return first.reduce((sum, value, i) => sum + Math.abs(value - second[i]), 0) / first.length
      }))
      if (!clearDetail) clearDetail = detail
      else detail.forEach((value, i) => {
        assert.ok(clearDetail[i] > 12 && value < clearDetail[i] * .55, `${areas[i].selector} frost 0/100: ${clearDetail[i].toFixed(1)} / ${value.toFixed(1)}`)
      })
    }
    return defaults
  } finally {
    await style.evaluate(el => el.remove())
  }
}

function luminance(rgb) {
  return Array.from(rgb, (channel, index) => {
    const s = channel / 255
    return (s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index]
  }).reduce((sum, channel) => sum + channel, 0)
}

export async function checkIslandMaterialContrast(page) {
  const region = page.locator('.workshop-stage')
  const original = await region.getAttribute('style')
  const targets = ['.progress-content--track', '.island-settings-button', '.island-local-servers__address span']
  const patches = await Promise.all(targets.map(async selector => {
    const target = page.locator(selector).first()
    const rect = await target.boundingBox()
    assert.ok(rect, 'Missing ' + selector)
    const ink = await target.evaluate(el => getComputedStyle(el).color.match(/[\d.]+/g).slice(0, 3).map(Number))
    return { selector, ink, clip: { x: Math.floor(rect.x + rect.width / 2), y: Math.floor(rect.y + rect.height / 2), width: 3, height: 3 } }
  }))
  const mask = await page.addStyleTag({ content: `
    .progress-content--track .marquee, .island-settings-button svg { visibility: hidden !important; }
    .island-local-servers__address span { opacity: 0 !important; }
    .island-feedback__ambient { visibility: hidden !important; }
  ` })
  async function sample(background) {
    await region.evaluate((el, value) => el.style.setProperty('background', value, 'important'), background)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const screenshot = await page.screenshot()
    return Promise.all(patches.map(({ clip }) => sharp(screenshot)
      .extract({ left: clip.x, top: clip.y, width: clip.width, height: clip.height })
      .resize(1, 1).removeAlpha().raw().toBuffer()))
  }
  try {
    const bright = await sample('#fff')
    const dark = await sample('#141414')
    for (const [i, { ink, selector }] of patches.entries()) {
      const ratio = (luminance(ink) + .05) / (luminance(bright[i]) + .05)
      assert.ok(ratio >= 4.5, `${selector} contrast over white: ${ratio.toFixed(2)}:1`)
      assert.ok(bright[i][0] - dark[i][0] > 18, `${selector} no longer transmits the backdrop`)
    }
  } finally {
    await region.evaluate((el, style) => {
      if (style === null) el.removeAttribute('style')
      else el.setAttribute('style', style)
    }, original)
    await mask.evaluate(el => el.remove())
  }
}

// Small dictated text must remain readable over a bright document, including
// the tentative words that are drawn with a different emphasis.
export async function checkRecorderContrast(page) {
  const stage = page.locator('.workshop-stage')
  const originalStyle = await stage.getAttribute('style')
  try {
    await stage.evaluate(el => el.style.setProperty('background', '#fff', 'important'))
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const overlay = page.locator('.dictation-overlay')
    const { x, y, width, height } = await overlay.boundingBox()
    const clip = { x: Math.round(x + width * .24), y: Math.round(y + height * .80), width: 6, height: 2 }
    const plate = await sharp(await page.screenshot({ clip })).resize(1, 1).removeAlpha().raw().toBuffer()
    const styles = await overlay.locator('.dictation-overlay__text, .dictation-overlay__text span').evaluateAll(nodes =>
      nodes.map(node => {
        const css = getComputedStyle(node)
        return { color: css.color, opacity: Number(css.opacity) }
      }),
    )
    assert.equal(styles.length, 2)
    for (const { color, opacity } of styles) {
      const [r, g, b, alpha = 1] = color.match(/[\d.]+/g).map(Number)
      const ink = [r, g, b].map((channel, i) => plate[i] + (channel - plate[i]) * opacity * alpha)
      const a = luminance(ink), bkg = luminance(plate)
      const contrast = (Math.max(a, bkg) + .05) / (Math.min(a, bkg) + .05)
      assert.ok(contrast >= 4.5, `Recorder text on white backdrop: ${contrast.toFixed(2)}:1`)
    }
  } finally {
    await stage.evaluate((el, style) => {
      if (style === null) el.removeAttribute('style')
      else el.setAttribute('style', style)
    }, originalStyle)
  }
}
