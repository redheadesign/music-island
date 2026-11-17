import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { preview } from 'vite'

const criticalStories = [
  'screens-settings--material-at-minimum-size', 'screens-settings--bass-source-shortcut',
  'screens-settings--theme-switch', 'screens-settings--classic-light',
  'screens-settings--taskbar', 'screens-settings--autostart-error',
  'screens-settings--about', 'screens-settings--voice-developer-mode',
  'screens-settings--assistant-limits', 'screens-voiceguide--troubleshooting',
  'screens-bettervoice--classic-running', 'screens-bettervoice--glass-start-error',
  'screens-dictation--general-needs-model', 'screens-dictation--import-preview',
  'screens-dictation--history-actions', 'screens-dictation--glass-dictionary',
  'screens-dictation--post-processing-setup', 'screens-dictation--glass-advanced-load-error',
  'screens-onboarding--first-launch', 'screens-onboarding--layout', 'screens-onboarding--voice',
  'screens-dictation--history-delete-confirmation', 'screens-dictation--custom-model-file',
  'molecules-dictationoverlay--long-transcription', 'screens-onboarding--custom-shortcut',
  'organisms-usagesettingssection--stale-limit',
  'screens-onboarding--save-error', 'screens-installnotice--running', 'screens-installnotice--open-failed',
  'screens-island--glass-edge-gesture', 'screens-island--glass-bass-burst', 'screens-island--glass-playback',
  'screens-island--glass-rays', 'screens-island--glass-mercury', 'screens-island--glass-widget-panels',
  'organisms-taskbarplayer--source-unavailable', 'organisms-directconnectiondialog--glass-error-narrow',
]
const ids = process.argv.length > 2 ? process.argv.slice(2) : criticalStories
if (ids.some(id => !/^[a-z0-9-]+$/.test(id))) throw new Error('Expected Storybook story IDs')
const output = path.resolve('.local/workshop-audit')
await mkdir(output, { recursive: true })
const server = await preview({
  configFile: false,
  build: { outDir: 'storybook-static' },
  preview: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
})
let browser
const results = []
try {
  const address = server.httpServer.address()
  const origin = 'http://127.0.0.1:' + address.port
  const index = await (await fetch(origin + '/index.json')).json()
  browser = await chromium.launch({ channel: process.env.WORKSHOP_BROWSER_CHANNEL || 'msedge', headless: true })
  for (const id of ids) {
    const errors = []
    const page = await browser.newPage({ viewport: { width: 1000, height: 780 } })
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text())
    })
    try {
      if (!index.entries[id]) throw new Error('Missing story ' + id)
      await page.goto(origin + '/iframe.html?id=' + id + '&viewMode=story', { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => ['finished', 'errored'].includes(window.__STORYBOOK_PREVIEW__?.currentRender?.phase), undefined, { timeout: 45000 })
      const phase = await page.evaluate(() => window.__STORYBOOK_PREVIEW__.currentRender.phase)
      if (phase !== 'finished') throw new Error('Render ended in ' + phase)
      if (!await page.locator('#storybook-root > *').count()) throw new Error('Empty story')
      await page.evaluate(() => document.fonts.ready)
    } catch (error) {
      errors.push(error.message)
    } finally {
      await page.screenshot({ path: path.join(output, id + '.png'), timeout: 15000 }).catch(error => errors.push(error.message))
      await page.close()
    }
    results.push({ id, errors })
    console.log(id, errors.length ? errors[0].slice(0, 350) : 'passed')
  }
} finally {
  await browser?.close()
  await server.close()
  await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
}
if (results.some(result => result.errors.length)) process.exitCode = 1
