import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import sharp from 'sharp'
import { checkTransport } from './transport.mjs'

const [port, evidence] = process.argv.slice(2)
const directory = path.dirname(fileURLToPath(import.meta.url))
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(fn, timeout = 12000) {
  const deadline = Date.now() + timeout
  let reason
  while (Date.now() < deadline) {
    try {
      const result = await fn()
      if (result) return result
    } catch (error) {
      reason = error
    }
    await sleep(100)
  }
  throw reason || new Error('Timed out: ' + String(fn).slice(0, 170))
}
async function fixture(message) {
  const tmp = path.join(evidence, 'req.tmp')
  await fs.writeFile(tmp, message)
  await until(async () => {
    await fs.rename(tmp, path.join(evidence, 'request'))
    return true
  })
  await until(async () => {
    const response = await fs.readFile(path.join(evidence, 'ack'), 'utf8')
    if (response.startsWith('ERROR')) throw new Error(response)
    return response === message
  }, 3500)
}
const browser = await until(async () => {
  for (const host of ['127.0.0.1', '[::1]']) {
    try { return await chromium.connectOverCDP('http://' + host + ':' + port, { timeout: 1200 }) } catch {}
  }
  return null
}, 50000)
const pages = async () => Object.fromEntries(await Promise.all(browser.contexts()[0].pages()
  .filter(page => /^https?:\/\/tauri\.localhost(?:\/|$)/.test(page.url()))
  .map(async page => [await page.evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label), page])))
const main = await until(async () => (await pages()).main)
const settings = await until(async () => (await pages()).settings)
await main.emulateMedia({ reducedMotion: 'no-preference', contrast: 'no-preference' })
// The packaged React app can read the runner's original accessibility setting
// before the debugger attaches. Start its frontend with the test setting in place.
await main.reload({ waitUntil: 'domcontentloaded' })
const invoke = (command, args = {}) => main.evaluate(([command, args]) => window.__TAURI_INTERNALS__.invoke(command, args), [command, args])
const preview = config => invoke('plugin:event|emit', { event: 'config:preview', payload: config })
const errors = []
main.on('pageerror', error => errors.push(error.message))
const log = {}
const synthetic = process.argv.includes('--synthetic')
const fakeSource = 'MusicIsland.Isolated.Windows.Test'
let fakeMedia
const emitFixture = async (patch = {}) => {
  fakeMedia = { ...fakeMedia, ...patch, updatedAt: new Date().toISOString() }
  await invoke('plugin:event|emit', { event: 'media:update', payload: fakeMedia })
}
try {
  await main.locator('.island-root').waitFor({ state: 'attached' })
  const config = await invoke('get_config')
  const factory = JSON.parse(await fs.readFile('src/shared/lib/defaultAppearance.json', 'utf8'))
  assert.equal(config.layout.width, factory.width)
  assert.equal(config.layout.scale, factory.scale)
  for (const [key, value] of Object.entries(factory.ui)) assert.deepEqual(config.plugins.settings.ui[key], value, key)
  assert.equal(config.media.protocol, 'smtc')
  assert.equal(config.media.directYandexConsent, false)
  assert.equal(config.media.preferredSourceAppId, null)
  log.factory = true
  console.log('Fresh app config matches export')

  const test = {
    directory, evidence, main, settings, until, log,
    async onFixtureReady() {
      const base = await invoke('get_config')
      assert.notEqual(base.media.preferredSourceAppId, null)
      const pinned = structuredClone(base)
      pinned.behavior.pinExpanded = true
      pinned.behavior.hideOverFullscreen = false
      const ui = pinned.plugins.settings.ui
      ui.hoverCoachCompleted = true
      ui.dismissedIslandUpdateVersion = '3.2.2'
      ui.islandLayout.zones.player.unshift('seekBack')
      ui.islandLayout.zones.player.push('seekForward')
      await invoke('save_config', { config: pinned, base })
      const island = main.locator('.island-root')
      const card = island.locator('.island-card')
      const strip = card.locator('.progress-track')
      const play = card.locator('.play-button').first()
      await card.waitFor({ timeout: 12000 })
      assert.equal(await card.evaluate(el => Boolean(el.closest('.reduced-motion,[data-reduced-motion="true"]'))), false)
      await until(async () => (await island.getAttribute('data-native-backdrop')) === 'active')
      console.log('Native backdrop active')
      if (synthetic) {
        await emitFixture()
        await play.waitFor()
      }
      try {
        await fixture('paint photo')
        await fixture('capture native-factory')
        log.desktopCapture = true
      } catch (error) {
        log.desktopCapture = error.message
      }
      const ambient = card.locator('.island-feedback__ambient')
      const mode = () => ambient.getAttribute('data-playback-motion')
      await main.evaluate(() => {
        window.glassClickTrace = []
        for (const type of ['pointerdown', 'click']) document.addEventListener(type, event => {
          if (event.target.closest?.('.play-button')) window.glassClickTrace.push(type)
        }, true)
      })
      const ring = () => ambient.evaluate(el => ({
        name: getComputedStyle(el, '::before').animationName,
        opacity: Number(getComputedStyle(el, '::before').opacity),
        count: el.querySelectorAll('.island-particles > i').length,
      }))
      const media = async () => {
        if (synthetic) {
          const native = await invoke('get_media_snapshot')
          assert.equal(native.hasSession, false, 'Expected no live media source in the protected process')
          return fakeMedia
        }
        const state = await invoke('get_media_snapshot')
        assert.equal(state.sourceAppId, pinned.media.preferredSourceAppId)
        return state
      }
      if (!synthetic) {
        await fs.writeFile(path.join(evidence, 'fixture-pause'), 'pause test fixture')
        await until(async () => (await media()).playbackStatus === 'paused' && (await mode()) === 'paused')
      }
      assert.equal((await media()).playbackStatus, 'paused')
      await play.click()
      if (synthetic) {
        assert.ok((await main.evaluate(() => window.glassClickTrace)).includes('click'))
        await emitFixture({ playbackStatus: 'playing' })
      }
      await until(async () => (await media()).playbackStatus === 'playing' && (await mode()) === 'playing')
      const playing = await ring()
      assert.match(playing.name, /island-glass-wave-launch/)
      await media()
      await play.click()
      if (synthetic) {
        assert.equal((await main.evaluate(() => window.glassClickTrace)).filter(event => event === 'click').length, 2)
        await emitFixture({ playbackStatus: 'paused' })
      }
      await until(async () => (await media()).playbackStatus === 'paused' && (await mode()) === 'paused')
      await until(async () => (await ring()).name === 'island-glass-wave-in')
      const paused = await until(async () => { const frame = await ring(); return frame.opacity === 0 && frame })
      assert.ok(paused.count > 0)
      console.log('Play and Pause drive ring launch and return in the packaged app')

      const initial = (await media()).positionMs
      await strip.press('ArrowRight')
      if (synthetic) {
        await until(async () => (await strip.locator('.progress-content--time').textContent()).startsWith('0:25'))
        await emitFixture({ positionMs: 25000 })
      }
      const keyboard = await until(async () => {
        const frame = await media()
        return frame.positionMs >= initial + 4000 && frame.positionMs
      })
      await media()
      await card.locator('.seek-step-button').last().click()
      if (synthetic) {
        await until(async () => (await strip.locator('.progress-content--time').textContent()).startsWith('0:35'))
        await emitFixture({ positionMs: 35000 })
      }
      const step = await until(async () => {
        const frame = await media()
        return frame.positionMs >= keyboard + 9000 && frame.positionMs
      })
      const seekVisual = await strip.locator('.progress-visual').evaluate(el => ({
        phase: el.dataset.progressPhase, opacity: Number(getComputedStyle(el.querySelector('.progress-fill')).opacity),
        animation: getComputedStyle(el.querySelector('.progress-fill')).animationName,
        selection: getComputedStyle(el.querySelector('.progress-content')).userSelect,
      }))
      assert.deepEqual(seekVisual, { phase: 'stable', opacity: 1, animation: 'none', selection: 'none' })
      console.log('Seek +5s and +10s passed in the packaged app')

      const custom = structuredClone(pinned)
      Object.assign(custom.plugins.settings.ui, {
        islandShader: { particleCount: 11, particleSpeed: 1.35, particleSize: 1.35, particleColor: '#77bbff' },
        advancedGlass: { ...factory.ui.advancedGlass,
          buttons: { frost: 8, bend: 0.35, dispersion: 0.36 },
          progressTrack: { frost: 17, radius: 14 }, progressFill: { radius: 5, brightness: 128 },
        },
      })
      await preview(custom)
      await until(async () => (await ring()).count === 11)
      const glass = await island.evaluate(el => {
        const read = selector => {
          const css = getComputedStyle(el.querySelector(selector))
          return { filter: css.backdropFilter, frost: css.getPropertyValue('--glass-region-frost'), radius: css.borderRadius }
        }
        return { seek: read('.seek-step-button'), track: read('.progress-track'),
          fill: read('.progress-fill'), outside: read('.island-actions .icon-button') }
      })
      assert.match(glass.seek.filter, /^blur\(8px\) url/)
      assert.equal(glass.track.filter, 'blur(17px)')
      assert.equal(glass.track.radius, '14px')
      assert.equal(glass.fill.radius, '5px')
      assert.equal(glass.outside.filter, 'none')
      assert.equal(Number(glass.outside.frost), 0.25)
      if (log.desktopCapture === true) await fixture('capture native-adjusted')

      await card.evaluate(node => {
        const layer = node.querySelector('.island-feedback__layer')
        layer.style.background = 'repeating-conic-gradient(#fff 0 25%, #101010 0 50%) 0 0 / 24px 24px'
        layer.querySelector('.island-feedback__ambient').style.visibility = 'hidden'
      })
      const pixels = []
      for (const selector of ['.seek-step-button', '.progress-track']) {
        const control = card.locator(selector).first()
        const take = () => control.screenshot({ animations: 'disabled' })
          .then(buffer => sharp(buffer).removeAlpha().raw().toBuffer())
        const active = await take()
        await control.evaluate(el => el.style.setProperty('backdrop-filter', 'none', 'important'))
        const plain = await take()
        const difference = active.reduce((sum, val, i) => sum + Math.abs(val - plain[i]), 0) / active.length
        assert.ok(difference > 1, 'Filter does not change rendered pixels: ' + selector)
        pixels.push({ selector, difference })
      }
      log.validated = { playing, paused, seekMs: [keyboard - initial, step - keyboard], seekVisual, glass, pixels }
    },
  }
  if (synthetic) {
    const current = await invoke('get_media_snapshot')
    assert.equal(current.hasSession, false)
    const guarded = structuredClone(config)
    guarded.media.preferredSourceAppId = fakeSource
    await invoke('save_config', { config: guarded, base: config })
    fakeMedia = { ...current, generation: (current.generation ?? 0) + 10, hasSession: true,
      sourceAppId: fakeSource, trackId: 'glass-qa', title: 'Music Island QA', artist: 'Windows',
      playbackStatus: 'paused', positionMs: 20000, durationMs: 120000,
      canPlay: true, canPause: true, canGoPrevious: true, canGoNext: true,
      canSeek: true, canLike: true, canDislike: true, smtcHealth: 'healthy' }
    log.mediaFixture = 'simulated SMTC snapshots, production UI and native Windows rendering'
    await test.onFixtureReady()
  } else {
    log.mediaFixture = 'Windows SMTC fixture'
    await checkTransport(test)
  }
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(evidence, 'native-acceptance.json'), JSON.stringify(log, null, 2))
  console.log(JSON.stringify(log))
} catch (error) {
  console.log('Playback diagnostics', await main.evaluate(() => {
    const ambient = document.querySelector('.island-card .island-feedback__ambient')
    return {
      hidden: document.hidden,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      wave: ambient?.dataset.playbackWave,
      motion: ambient?.dataset.playbackMotion,
      animation: ambient && getComputedStyle(ambient, '::before').animationName,
      reducedMotionAncestor: ambient?.closest('.reduced-motion,[data-reduced-motion="true"]')?.className,
      clicks: window.glassClickTrace,
      time: document.querySelector('.progress-content--time')?.textContent,
    }
  }).catch(() => null))
  throw error
} finally {
  await browser.close()
}
