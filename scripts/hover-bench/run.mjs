import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright-core'
import { observeWorkload, overlaps, startModelWorkload } from './workload.mjs'

const [exeArg, expectedDigest, outputArg, countArg = '200', hzArg = 'auto', idleArg = '300', scenario = 'idle'] = process.argv.slice(2)
if (!outputArg) throw Error('Usage: node run.mjs EXE SHA256 NEW_REPORT_DIRECTORY [cycles] [Hz] [idle-seconds] [scenario]')
assert.equal(process.platform, 'win32')
assert.equal(process.env.MUSIC_ISLAND_DISPOSABLE_DESKTOP, '1', 'Use a dedicated Windows test desktop. This benchmark drives the system pointer.')
const exe = path.resolve(exeArg)
const output = path.resolve(outputArg)
const count = Number(countArg), idleSeconds = Number(idleArg)
let hz = hzArg === 'auto' ? null : Number(hzArg)
let display = null
let behavior = null, idleCpu = null
let workload = { spans: [], finished: false, error: null }
const requiredWork = scenario === 'models' ? ['download', 'hash', 'load'] : scenario === 'streaming' ? ['streaming'] : []
assert.ok(Number.isInteger(count) && count > 0 && count <= 2000)
assert.ok((hz === null || (hz >= 30 && hz <= 1000)) && idleSeconds >= 0 && idleSeconds <= 3600)
assert.ok(['idle', 'models', 'streaming'].includes(scenario), 'Choose idle, models or streaming')
const digest = createHash('sha256').update(await readFile(exe)).digest('hex')
assert.equal(digest, expectedDigest.toLowerCase(), 'Portable executable checksum')
assert.ok(!existsSync(path.join(process.env.APPDATA, 'Music Island')), 'This account already has a Music Island profile')
const processes = execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq music-island.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true })
assert.ok(!/^"music-island\.exe"/im.test(processes), 'Music Island is already running')
await mkdir(output) // New directory only; keep all measurement artifacts and caches separate.
for (const name of ['roaming', 'local', 'webview', 'temp']) await mkdir(path.join(output, name))
const webview = path.join(output, 'webview')
const app = spawn(exe, ['--startup'], {
  cwd: output, windowsHide: true, stdio: 'ignore', env: {
    ...process.env, APPDATA: path.join(output, 'roaming'), LOCALAPPDATA: path.join(output, 'local'),
    TEMP: path.join(output, 'temp'), TMP: path.join(output, 'temp'),
    HF_HOME: path.join(output, 'local', 'huggingface'), WEBVIEW2_USER_DATA_FOLDER: webview,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=0 --remote-debugging-address=127.0.0.1',
  },
})
let browser, pointer, appError
app.on('error', error => { appError = error })
async function until(check, timeout = 6000, interval = 30) {
  const untilMs = Date.now() + timeout
  do {
    if (appError) throw appError
    if (app.exitCode !== null) throw Error('Owned Music Island exited')
    const value = await check()
    if (value) return value
    await sleep(interval)
  } while (Date.now() < untilMs)
  return null
}

const rows = []
function sampleCpu() {
  const script = fileURLToPath(new URL('./cpu.ps1', import.meta.url))
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-File', script, '-RootProcess', String(app.pid)],
    { encoding: 'utf8', windowsHide: true }))
}
const percentile = (values, p) => values.length
  ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null
const report = () => {
  const budgetMs = hz ? 2000 / hz : null
  const intervals = rows.map(row => row.acceptToReadyMs).filter(Number.isFinite)
  const evidence = rows.map(row => ({ ...row, workloads: [...new Set(workload.spans
    .filter(span => overlaps(span, row.accepted ?? row.openingCommit, row.ready)).map(span => span.name))] }))
  const byWorkload = Object.fromEntries(requiredWork.map(name => {
    const trials = evidence.filter(row => row.workloads.includes(name))
    const latency = trials.map(row => row.acceptToReadyMs).filter(Number.isFinite)
    return [name, { trials: trials.map(row => row.trial), p99Ms: percentile(latency, .99),
      maximumMs: latency.length ? Math.max(...latency) : null }]
  }))
  return { exeSha256: digest, windows: os.release(), display, hz, budgetMs, behavior, scenario, idleSeconds,
    idleCpu, requested: count,
    completed: rows.length, acceptedToTargetableFrameP99Ms: percentile(intervals, .99),
    maximumMs: intervals.length ? Math.max(...intervals) : null,
    missingFrames: rows.filter(row => !Number.isFinite(row.acceptToReadyMs)).map(row => row.trial),
    overBudget: rows.filter(row => budgetMs !== null && row.acceptToReadyMs > budgetMs).map(row => row.trial),
    missedFirstClicks: rows.filter(row => !row.openedSettings || !row.trustedClick).map(row => row.trial),
    byWorkload, workload, missingWorkloads: requiredWork.filter(name => !byWorkload[name].trials.length), rows: evidence }
}
try {
  const endpoint = await until(async () => {
    for (const dir of [webview, path.join(webview, 'EBWebView')]) {
      const contents = await readFile(path.join(dir, 'DevToolsActivePort'), 'utf8').catch(() => '')
      const [port, url] = contents.trim().split(/\r?\n/)
      if (/^\d+$/.test(port) && /^\/devtools\/browser\/[\da-f-]+$/i.test(url))
        return 'ws://127.0.0.1:' + port + url
    }
  }, 30000, 150)
  assert.ok(endpoint, 'The newly launched WebView did not publish its private debugging endpoint')
  browser = await chromium.connectOverCDP(endpoint)
  const ownWindow = (label, needsOverlay = false) => until(async () => {
    for (const candidate of browser.contexts().flatMap(context => context.pages())) {
      if (new URL(candidate.url()).hostname !== 'tauri.localhost') continue
      const matched = await candidate.evaluate(({ label, needsOverlay }) =>
        window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label === label &&
          (!needsOverlay || !!document.querySelector('.island-root')), { label, needsOverlay }).catch(() => false)
      if (matched) return candidate
    }
  }, 30000)
  const page = await ownWindow('main', true)
  assert.ok(page, 'Owned main WebView not found')
  behavior = await page.evaluate(async () => {
    const config = await window.__TAURI_INTERNALS__.invoke('get_config')
    return { hoverDelayMs: config.behavior.hoverDelayMs, reducedMotion: config.appearance.reducedMotion }
  })
  const python = process.env.MUSIC_ISLAND_HOVER_PYTHON
  const helper = fileURLToPath(new URL('./pointer.py', import.meta.url))
  pointer = spawn(python || 'py', [...(python ? [] : ['-3']), helper, String(app.pid)], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true })
  pointer.on('error', error => { appError = error })
  const replies = createInterface({ input: pointer.stdout })[Symbol.asyncIterator]()
  const command = async (op, point = {}) => {
    pointer.stdin.write(JSON.stringify({ op, ...point }) + '\n')
    const { value, done } = await replies.next()
    if (done) throw Error('Windows pointer helper exited')
    const reply = JSON.parse(value)
    if (reply.error) throw Error(reply.error)
    return reply.value
  }
  display = await until(() => command('display'), 30000)
  assert.ok(display, 'The main native overlay never became visible')
  if (hz && display.hz && Math.abs(hz - display.hz) > 1) throw Error('Supplied refresh rate differs from the monitor')
  hz = display.hz || hz
  const requestedDpi = Number(process.env.MUSIC_ISLAND_EXPECT_DPI)
  if (requestedDpi && display.dpi !== requestedDpi) throw Error('Expected physical DPI ' + requestedDpi + ', measured ' + display.dpi)
  const settings = requiredWork.length ? await ownWindow('settings') : null
  if (requiredWork.length) {
    assert.ok(settings, 'Owned Settings WebView not found')
    await settings.evaluate(observeWorkload)
  }
  if (scenario === 'streaming') {
    console.log('Use the isolated instance with a test audio input and a streaming model. Start the live dictation, then press Enter.')
    const input = createInterface({ input: process.stdin })
    try { await input[Symbol.asyncIterator]().next() } finally { input.close() }
  }
  await page.evaluate(() => {
    const selector = '[data-island-action="settings"]'
    window.__musicIslandHoverTrace = (phase, at) => {
      const row = window.__hoverTrial
      if (row && row[phase] == null) row[phase] = performance.timeOrigin + at
    }
    document.addEventListener('click', event => {
      if (event.isTrusted && event.target.closest?.(selector) && window.__hoverTrial)
        window.__hoverTrial.trustedClick = performance.timeOrigin + performance.now()
    }, true)
    window.__startHoverTrial = trial => {
      const row = { trial }
      window.__hoverTrial = row
      const mutations = new MutationObserver(() => {
        if (document.querySelector('.edge-trigger--peeking')) row.peekCommit ??= performance.timeOrigin + performance.now()
        if (document.querySelector('.island-root--opening')) row.openingCommit ??= performance.timeOrigin + performance.now()
      })
      mutations.observe(document.querySelector('.island-root'), { subtree: true, attributes: true, attributeFilter: ['class'] })
      const start = performance.now()
      function sample() {
        if (window.__hoverTrial !== row || performance.now() - start > 6500) { mutations.disconnect(); return }
        const button = document.querySelector(selector)
        const zone = document.querySelector('.island-hover-zone')
        if (button && zone && zone.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
          const time = performance.timeOrigin + performance.now()
          row.visible ??= time
          const box = button.getBoundingClientRect()
          const x = (Math.min(innerWidth, box.right) + Math.max(0, box.left)) / 2
          const y = (Math.min(innerHeight, box.bottom) + Math.max(0, box.top)) / 2
          if (x > 0 && y > 0 && !button.disabled && !button.closest('[inert]') && button.contains(document.elementFromPoint(x, y))) {
            row.ready = time
            mutations.disconnect()
            void window.__firstIslandTarget({ trial, x: x / innerWidth, y: y / innerHeight })
            return
          }
        }
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    }
  })
  let firstTarget
  await page.exposeFunction('__firstIslandTarget', point => firstTarget?.(point))
  for (let i = 0; i < count; i++) {
    await command('dismiss')
    await command('leave')
    assert.ok(await until(async () => !(await command('settings')) && await page.locator('.island-root--collapsed').count()
      && !(await page.locator('.island-hover-zone').count())), 'Overlay did not finish collapsing')
    if (i === 1 && idleSeconds) {
      const before = sampleCpu()
      await sleep(idleSeconds * 1000)
      const after = sampleCpu()
      const continuous = Object.keys(before.cpuMs).filter(id => Object.hasOwn(after.cpuMs, id))
      const cpuMs = continuous.reduce((t, id) => t + after.cpuMs[id] - before.cpuMs[id], 0)
      const elapsedMs = after.at - before.at
      idleCpu = { elapsedMs, cpuMs, corePercent: 100 * cpuMs / elapsedMs, continuousProcesses: continuous.length,
        processSetChanged: continuous.length !== Object.keys(before.cpuMs).length || continuous.length !== Object.keys(after.cpuMs).length }
    }
    if (scenario === 'models' && i === 2) await settings.evaluate(startModelWorkload, process.env.MUSIC_ISLAND_HOVER_MODEL || 'small')
    const target = new Promise(resolve => { firstTarget = point => { if (point.trial === i + 1) resolve(point) } })
    await page.evaluate(trial => window.__startHoverTrial(trial), i + 1)
    const edge = await command('edge')
    let timer
    const point = await Promise.race([target, new Promise(resolve => { timer = setTimeout(() => resolve(null), 6000) })])
    clearTimeout(timer)
    firstTarget = null
    const click = point ? await command('click', point) : { sent: false, reason: 'no-clickable-frame' }
    const openedSettings = click.sent && !!await until(() => command('settings'), 1200, 15)
    const sample = await page.evaluate(() => {
      const row = window.__hoverTrial
      window.__hoverTrial = null
      return row
    })
    const acceptance = sample.accepted ?? sample.openingCommit
    rows.push({ trial: i + 1, phase: i === 0 ? 'cold' : i === 1 && idleSeconds ? 'after-idle' : 'repeated',
      realEdge: edge.at, ...sample, acceptanceSource: sample.accepted == null ? 'DOM commit (baseline)' : 'gesture',
      acceptToReadyMs: sample.ready != null && acceptance != null ? sample.ready - acceptance : null,
      edgeToFirstFrameMs: sample.visible != null ? sample.visible - edge.at : null,
      nativeClick: click, openedSettings })
    if (settings) workload = await settings.evaluate(() => window.__hoverWorkload)
    await writeFile(path.join(output, 'report.json'), JSON.stringify(report(), null, 2))
  }
  const result = report()
  console.log(JSON.stringify({ cycles: rows.length, p99Ms: result.acceptedToTargetableFrameP99Ms, maximumMs: result.maximumMs,
    missedFirstClicks: result.missedFirstClicks, overBudget: result.overBudget }))
  if (!hz || result.missedFirstClicks.length || result.missingFrames.length || result.overBudget.length
    || result.missingWorkloads.length || workload.error || (scenario === 'models' && !workload.finished)) process.exitCode = 1
} catch (error) {
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ ...report(), error: String(error) }, null, 2))
  throw error
} finally {
  pointer?.stdin.end()
  await browser?.close().catch(() => {})
  if (app.pid && app.exitCode === null) app.kill()
}
