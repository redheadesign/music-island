// Run manually when updating Glisse or the island's lens profile:
// node scripts/bake-glass-bezel.mjs
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import sharp from 'sharp'
import { build } from 'vite'

const entry = 'virtual:glisse-bezel'
const width = 500, height = 228, radius = 36
const result = await build({
  configFile: false,
  logLevel: 'warn',
  plugins: [{
    name: 'glisse-reference',
    resolveId: id => id === entry ? '\0' + entry : undefined,
    load: id => id === '\0' + entry ? `
      import { createElement } from 'react'
      import { createRoot } from 'react-dom/client'
      import { Glass } from 'glisse'
      createRoot(document.body).render(createElement(Glass, { style: {
        width: ${width}, height: ${height}, borderRadius: ${radius},
        '--lg-glass-bend': '.42', '--lg-glass-dispersion': '0',
        '--lg-rim-shine': '.76', '--lg-edge': 'rgba(242,245,248,.44)',
      } }))
    ` : undefined,
  }],
  build: { write: false, rolldownOptions: { input: entry, output: { format: 'iife' } } },
})
const script = result.output.find(file => file.type === 'chunk')
const browser = await chromium.launch({ channel: 'msedge' })
let maps
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  await page.addScriptTag({ content: script.code })
  const filter = page.locator('filter[id^="glisse-backdrop-"]')
  await filter.waitFor({ state: 'attached' })
  // Zero dispersion means each RGB ray follows exactly the same field.
  // Pack Glisse's two independent scalar fields into R/G for a single pass.
  maps = await Promise.all(['across-0', 'down-0'].map(async name => {
    const uri = await filter.locator('feImage[result="' + name + '"]').getAttribute('href')
    const image = sharp(Buffer.from(uri.split(',')[1], 'base64'))
    return image.extractChannel('red').raw().toBuffer()
  }))
} finally {
  await browser.close()
}
const [across, down] = maps
assert.equal(across.length, width * height)
assert.equal(down.length, across.length)
const pixels = Buffer.alloc(across.length * 3, 128)
for (let pixel = 0; pixel < across.length; pixel++) {
  pixels[pixel * 3] = across[pixel]
  pixels[pixel * 3 + 1] = down[pixel]
}
const asset = fileURLToPath(new URL('../src/shared/ui/glisse-bezel.png', import.meta.url))
await sharp(pixels, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 9 }).toFile(asset)
