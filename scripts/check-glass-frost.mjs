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
    const luminance = rgb => Array.from(rgb, (channel, index) => {
      const s = channel / 255
      return (s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index]
    }).reduce((sum, channel) => sum + channel, 0)
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
