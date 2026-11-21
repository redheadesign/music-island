import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { preview } from 'vite'
import { checkGlassFrost, checkIslandWidgetTransmission, checkRecorderContrast } from './check-glass-frost.mjs'

const criticalStories = [
  'foundations-interfacetheme--third-theme', 'screens-settings--retry-failed-save', 'screens-settings--unreadable-profile',
  'screens-settings--default', 'screens-settings--material-at-minimum-size', 'screens-settings--glass-playback-background', 'screens-settings--glass-material-tuning',
  'screens-settings--theme-switch', 'molecules-interfacepalettepicker--presets',
  'screens-settings--glass-accessible', 'screens-island--glass-control-lenses-reduced-transparency',
  'screens-settings--taskbar', 'screens-settings--autostart-error',
  'screens-settings--about', 'screens-settings--voice-developer-mode',
  'screens-settings--assistant-limits', 'screens-voiceguide--troubleshooting',
  'screens-bettervoice--settings-groups',
  'screens-bettervoice--classic-running', 'screens-bettervoice--start-error',
  'screens-dictation--general-needs-model', 'screens-dictation--independent-capsule-material', 'screens-dictation--import-preview',
  'screens-dictation--history-actions', 'screens-dictation--dictionary-fields',
  'screens-dictation--post-processing-setup', 'screens-dictation--advanced-load-error-narrow',
  'screens-onboarding--first-launch', 'screens-onboarding--layout', 'screens-onboarding--voice',
  'screens-dictation--history-delete-confirmation', 'screens-dictation--custom-model-file',
  'screens-dictationcompute--background-recognition', 'screens-dictationcompute--other-engine',
  'screens-dictation--catalog-cards-narrow', 'molecules-modelcard--failed-retry', 'molecules-modelcard--downloading',
  'organisms-musicmodule--directional-progress', 'organisms-musicmodule--reduced-motion-progress', 'organisms-musicmodule--seek-gesture',
  'molecules-dictationoverlay--glass-classic', 'molecules-dictationoverlay--glass-waves', 'molecules-dictationoverlay--glass-fox',
  'molecules-dictationoverlay--glass-error', 'molecules-dictationoverlay--glass-progress', 'molecules-dictationoverlay--glass-live-text',
  'molecules-dictationoverlay--live-material-switch',
  'organisms-musicmodule--system-volume', 'screens-dictation--floating-catalog', 'atoms-playbackfeedback--local-heart', 'molecules-dictationoverlay--fox-progress',
  'organisms-islandlayouteditor--inline-layout', 'organisms-islandlayouteditor--full-inline-layout',
  'molecules-dictationoverlay--long-transcription', 'screens-onboarding--custom-shortcut',
  'organisms-usagesettingssection--stale-limit',
  'screens-onboarding--save-error', 'screens-installnotice--running', 'screens-installnotice--open-failed',
  'screens-island--advanced-glass-surfaces', 'screens-settings--advanced-surface-editor', 'screens-dictation--advanced-capsule-surface', 'screens-dictation--pinned-recorder-preview',
  'screens-island--glass-optical-surface', 'screens-island--glass-control-lenses', 'screens-island--glass-edge-gesture', 'screens-island--glass-reactive-wave', 'screens-island--glass-playback',
  'screens-island--glass-cool-cover', 'screens-island--glass-without-cover',
  'screens-island--glass-background-off', 'screens-island--glass-widget-panels',
  'organisms-taskbarlayouteditor--glass-catalog', 'screens-bettervoice--signal-route', 'screens-bettervoice--signal-route-narrow',
  'organisms-taskbarplayer--source-unavailable', 'organisms-directconnectiondialog--glass-error-narrow',
]
const ids = process.argv.length > 2 ? process.argv.slice(2) : criticalStories
if (ids.some(id => !/^[a-z0-9-]+$/.test(id))) throw new Error('Expected Storybook story IDs')
const output = path.resolve('.local/workshop-audit')
await mkdir(output, { recursive: true })
const server = await preview({
  configFile: false,
  build: { outDir: 'storybook-static' },
  preview: { host: '127.0.0.1', port: 4177 },
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
      if (id === 'screens-settings--glass-material-tuning') {
        // Native summary activation requires browser keyboard events.
        const group = page.locator('.glass-material-settings')
        const summary = page.locator('details').filter({ has: group }).locator('summary')
        await summary.press('Space')
        await group.waitFor({ state: 'hidden' })
        await summary.press('Enter')
        await group.waitFor({ state: 'visible' })
      }
      if (id === 'screens-island--glass-without-cover') {
        await checkGlassFrost(page)
      }
      if (id === 'screens-island--glass-widget-panels') {
        await checkIslandWidgetTransmission(page)
      }
      if (id === 'molecules-dictationoverlay--glass-live-text') {
        await checkRecorderContrast(page)
      }
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
