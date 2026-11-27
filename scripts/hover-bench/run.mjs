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
import { idleCpuMetrics, observeWorkload, overlaps, startModelWorkload } from './workload.mjs'

const [exeArg, expectedDigest, outputArg, countArg = '200', hzArg = 'auto', idleArg = '300', scenario = 'idle'] = process.argv.slice(2)
const publicModels = countArg === 'public-models'
if (!outputArg) throw Error('Usage: node run.mjs EXE SHA256 NEW_REPORT_DIRECTORY [public-models | cycles Hz idle-seconds scenario]')
assert.equal(process.platform, 'win32')
assert.equal(process.env.MUSIC_ISLAND_DISPOSABLE_DESKTOP, '1', 'Use a dedicated Windows test desktop and fresh account.')
const exe = path.resolve(exeArg)
const output = path.resolve(outputArg)
const count = Number(countArg), idleSeconds = Number(idleArg)
let hz = hzArg === 'auto' ? null : Number(hzArg)
let display = null
let behavior = null, idleCpu = null
let streaming = null
let workload = { spans: [], finished: false, error: null }
const requiredWork = scenario === 'models' ? ['download', 'hash', 'load'] : scenario === 'streaming' ? ['streaming'] : []
assert.ok(publicModels || (Number.isInteger(count) && count > 0 && count <= 2000))
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
let browser, pointer, renderer, recordingSettings, appError
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

const rows = [], publicResults = []
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
  const sharedCommit = rows.map(row => row.openingCommitToReadyMs).filter(Number.isFinite)
  const physicalContact = rows.map(row => row.edgeToReadyMs).filter(Number.isFinite)
  const evidence = rows.map(row => ({ ...row, workloads: [...new Set(workload.spans
    .filter(span => overlaps(span, row.accepted ?? row.openingCommit, row.ready)).map(span => span.name))] }))
  const byWorkload = Object.fromEntries(requiredWork.map(name => {
    const trials = evidence.filter(row => row.workloads.includes(name))
    const latency = trials.map(row => row.acceptToReadyMs).filter(Number.isFinite)
    return [name, { trials: trials.map(row => row.trial), p99Ms: percentile(latency, .99),
      maximumMs: latency.length ? Math.max(...latency) : null }]
  }))
  return { exeSha256: digest, windows: os.release(), display, hz, budgetMs, behavior, scenario, idleSeconds,
    idleCpu, streaming, requested: count,
    completed: rows.length, acceptedToTargetableFrameP99Ms: percentile(intervals, .99),
    comparable: { openingCommitToTargetP99Ms: percentile(sharedCommit, .99),
      openingCommitToTargetMaxMs: sharedCommit.length ? Math.max(...sharedCommit) : null,
      physicalEdgeToTargetP99Ms: percentile(physicalContact, .99),
      physicalEdgeToTargetMaxMs: physicalContact.length ? Math.max(...physicalContact) : null,
      missingCommits: rows.filter(row => !Number.isFinite(row.openingCommitToReadyMs)).map(row => row.trial) },
    maximumMs: intervals.length ? Math.max(...intervals) : null,
    missingGestureAcceptance: rows.filter(row => !Number.isFinite(row.accepted)).map(row => row.trial),
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
  if (publicModels) await verifyPublicModels(await ownWindow('settings'))
  else await measureHover(ownWindow)
} catch (error) {
  const partial = publicModels ? { exeSha256: digest, models: publicResults } : report()
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ ...partial, error: String(error) }, null, 2))
  throw error
} finally {
  if (recordingSettings) await recordingSettings.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:dictation|cancel_operation')).catch(() => {})
  if (renderer?.pid && renderer.exitCode === null) renderer.kill()
  pointer?.stdin.end()
  await browser?.close().catch(() => {})
  if (app.pid && app.exitCode === null) app.kill()
}

async function verifyPublicModels(settings) {
  assert.ok(settings, 'Owned Settings WebView not found')
  const packs = JSON.parse(await readFile(new URL('../../src-tauri/crates/handy-core/src/catalog/gigaam-packs.json', import.meta.url), 'utf8'))
  await settings.evaluate(observeWorkload)
  for (const id of ['gigaam-v4-rnnt', 'gigaam-multilingual-v2-rnnt']) {
    const pack = packs.find(entry => entry.id === id)
    assert.ok(pack?.files?.length, 'No pinned catalog files for ' + id)
    await settings.evaluate(startModelWorkload, id)
    const run = await until(() => settings.evaluate(() => window.__hoverWorkload.finished && window.__hoverWorkload), 35 * 60000, 500)
    assert.ok(run && !run.error, id + ': ' + (run?.error || 'timed out'))
    const verified = run.spans.filter(span => span.id === id && span.name === 'hash' && span.end != null).length
    assert.equal(verified, pack.files.length, 'Native checksum completions for ' + id)
    const installed = await settings.evaluate(async modelId => {
      const invoke = window.__TAURI_INTERNALS__.invoke
      await invoke('plugin:dictation|rescan_local_models')
      const model = await invoke('plugin:dictation|get_model_info', { modelId })
      const status = await invoke('plugin:dictation|get_model_load_status')
      if (!model?.is_downloaded || !status.is_loaded || status.current_model !== modelId) throw Error('Expected selected model to be installed and loaded')
      await invoke('plugin:dictation|unload_model_manually')
      await invoke('plugin:dictation|delete_model', { modelId })
      await invoke('plugin:dictation|rescan_local_models')
      const after = await invoke('plugin:dictation|get_model_info', { modelId })
      if (!after || after.is_downloaded) throw Error('Model cleanup was not confirmed')
      return { backend: status.backend, installed: true, loaded: true, removed: true }
    }, id)
    publicResults.push({ id, ...installed, verifiedFiles: verified, bytes: pack.files.reduce((n, file) => n + file.size, 0),
      workload: run.spans.filter(span => span.id === id) })
    await writeFile(path.join(output, 'report.json'), JSON.stringify({ exeSha256: digest, models: publicResults }, null, 2))
    console.log(id, 'passed')
  }
}

async function measureHover(ownWindow) {
  let streamEvidence
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
    const device = process.env.MUSIC_ISLAND_DICTATION_REQUIRED_INPUT
    const helper = process.env.MUSIC_ISLAND_HOVER_AUDIO_HELPER
    const renderId = process.env.MUSIC_ISLAND_HOVER_RENDER_ID
    const wav = process.env.MUSIC_ISLAND_HOVER_WAV
    assert.ok(device && helper && renderId && wav && idleSeconds === 0, 'Use streaming.ps1 with a private audio cable and synthetic WAV')
    const model = await settings.evaluate(async requiredInput => {
      const invoke = window.__TAURI_INTERNALS__.invoke
      const status = await invoke('plugin:dictation|get_status')
      if (status.captureConstraint?.requiredInput !== requiredInput) throw Error('Application did not acknowledge the exact required input device')
      const models = await invoke('plugin:dictation|get_available_models')
      await invoke('plugin:dictation|change_transcribe_accelerator_setting', { accelerator: 'cpu' })
      await invoke('plugin:dictation|change_paste_method_setting', { method: 'none' })
      await invoke('plugin:dictation|change_post_process_enabled_setting', { enabled: false })
      await invoke('plugin:dictation|change_audio_feedback_setting', { enabled: false })
      await invoke('plugin:dictation|change_mute_while_recording_setting', { enabled: false })
      await invoke('plugin:dictation|change_overlay_style_setting', { style: 'live' })
      return models.find(m => m.filename === 'moonshine-streaming-tiny-Q8_0.gguf' && m.supports_streaming)?.id
    }, device)
    assert.ok(model, 'Missing Moonshine Streaming Tiny Q8_0')
    await settings.evaluate(startModelWorkload, model)
    const loaded = await until(() => settings.evaluate(() => window.__hoverWorkload.finished && window.__hoverWorkload), 300000, 250)
    assert.ok(loaded && !loaded.error, loaded?.error || 'Streaming model failed to load')
    await settings.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:dictation|toggle', { postProcess: false }))
    recordingSettings = settings
    const active = await until(() => settings.evaluate(async () => {
      const data = await window.__TAURI_INTERNALS__.invoke('plugin:dictation|get_status')
      if (data.phase === 'error') throw Error('Capture failed: ' + data.error)
      return data.phase === 'streaming' && data.ready && data.operationId
    }), 30000, 60)
    assert.ok(active, 'The real recorder never entered ready streaming')
    const capsule = await ownWindow('recording_overlay')
    assert.ok(capsule, 'Owned dictation capsule not found')
    await capsule.evaluate(async operationId => {
      window.__hoverPreview = { events: 0, last: null }
      const { invoke, transformCallback } = window.__TAURI_INTERNALS__
      await invoke('plugin:event|listen', { event: 'stream-text-event', target: {kind: 'Any'},
        handler: transformCallback(({payload}) => {
          if (payload.operation_id !== operationId || !(payload.committed || payload.tentative)) return
          window.__hoverPreview.events++
          window.__hoverPreview.last = performance.timeOrigin + performance.now()
        }) })
    }, active)
    renderer = spawn(helper, ['render', renderId, wav], { cwd: output, stdio: 'inherit', windowsHide: true })
    renderer.on('error', error => { appError = error })
    const preview = await until(() => capsule.evaluate(() => window.__hoverPreview.events > 0), 45000, 120)
    assert.ok(preview, 'The streaming engine emitted no speech preview from the private fixture')
    streaming = { model, active, device, wavSha256: createHash('sha256').update(await readFile(wav)).digest('hex') }
    streamEvidence = () => capsule.evaluate(() => window.__hoverPreview)
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
  // A pinned 1.55 GB transfer keeps its real checksum active across the configured dwell.
  const modelId = process.env.MUSIC_ISLAND_HOVER_MODEL || 'turbo'
  const waitForModel = async condition => {
    const reached = await until(async () => {
      const state = await settings.evaluate(() => window.__hoverWorkload)
      if (state.error) throw Error(state.error)
      return condition(state)
    }, 15 * 60000, 20)
    assert.ok(reached, 'Timed out waiting for the native model workload')
  }
  for (let i = 0; i < count; i++) {
    await command('dismiss')
    assert.ok(await until(async () => !(await command('settings'))), 'Owned Settings window did not hide')
    const previous = rows.at(-1)
    if (previous) {
      // The released 3.2.2 loses a leave received within its 280 ms opening grace.
      // Exercise the candidate's first early leave, then use identical resets.
      const earlyLeave = i === 1 && previous.accepted != null
      if (!earlyLeave && previous.openingCommit != null) await sleep(Math.max(0, previous.openingCommit + 310 - Date.now()))
      previous.earlyLeaveCheck = earlyLeave
    }
    await command('leave')
    if (!await until(async () => await page.locator('.island-root--collapsed').count() && !(await page.locator('.island-hover-zone').count()))) {
      const diagnostics = await page.evaluate(async () => ({
        classes: document.querySelector('.island-root')?.className,
        pointer: await window.__TAURI_INTERNALS__.invoke('get_collapsed_gesture_state'),
      }))
      throw Error('Overlay did not finish collapsing after trial ' + i + ': ' + JSON.stringify(diagnostics))
    }
    if (i === 1 && idleSeconds) {
      const durationMs = idleSeconds * 1000
      const samples = [sampleCpu()]
      const deadline = performance.now() + durationMs
      do {
        await sleep(Math.min(30000, Math.max(0, deadline - performance.now())))
        samples.push(sampleCpu())
      } while (performance.now() < deadline)
      idleCpu = idleCpuMetrics(samples, os.cpus().length, durationMs)
    }
    const intendedWorkload = scenario === 'models' ? ['download', 'hash', 'load'][i - 2] : undefined
    if (intendedWorkload === 'download') await settings.evaluate(startModelWorkload, modelId)
    if (intendedWorkload === 'download' || intendedWorkload === 'hash') {
      // Start the physical gesture at the observed transfer or checksum event. The report
      // still requires real overlap with acceptance, even if the native operation ends early.
      await waitForModel(state => state.spans.some(span => span.name === intendedWorkload && span.id === modelId) || state.finished)
    }
    if (intendedWorkload === 'load') {
      await waitForModel(state => state.finished)
      await settings.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:dictation|unload_model_manually'))
    }
    const target = new Promise(resolve => { firstTarget = point => { if (point.trial === i + 1) resolve(point) } })
    await page.evaluate(trial => window.__startHoverTrial(trial), i + 1)
    const edge = await command('edge')
    // Cold-load from the installed model during this real gesture. Keep the pointer and
    // frame observer independent from the Settings IPC promise so the first click is prompt.
    let loadError
    const reload = intendedWorkload === 'load' ? sleep(behavior.hoverDelayMs * .75).then(() =>
      settings.evaluate(id => window.__TAURI_INTERNALS__.invoke('plugin:dictation|set_active_model', { modelId: id }), modelId)
    ).catch(error => { loadError = error }) : null
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
    if (streamEvidence) {
      assert.ok(renderer?.pid && renderer.exitCode === null, 'Synthetic speech ended before the hover trials finished')
      const evidence = await streamEvidence()
      sample.previewEvents = evidence.events
      sample.lastPreviewAt = evidence.last
      streaming.previewEvents = evidence.events
    }
    rows.push({ trial: i + 1, phase: scenario === 'streaming' ? 'streaming' : i === 0 ? 'cold' : i === 1 && idleSeconds ? 'after-idle' : 'repeated',
      realEdge: edge.at, ...sample, intendedWorkload, acceptanceSource: sample.accepted == null ? 'DOM commit (baseline)' : 'gesture',
      acceptToReadyMs: sample.ready != null && acceptance != null ? sample.ready - acceptance : null,
      openingCommitToReadyMs: sample.ready != null && sample.openingCommit != null ? sample.ready - sample.openingCommit : null,
      edgeToReadyMs: sample.ready != null ? sample.ready - edge.at : null,
      edgeToFirstFrameMs: sample.visible != null ? sample.visible - edge.at : null,
      nativeClick: click, openedSettings })
    await reload
    if (loadError) throw loadError
    if (settings) workload = await settings.evaluate(() => window.__hoverWorkload)
    await writeFile(path.join(output, 'report.json'), JSON.stringify(report(), null, 2))
  }
  const result = report()
  console.log(JSON.stringify({ cycles: rows.length, p99Ms: result.acceptedToTargetableFrameP99Ms, maximumMs: result.maximumMs,
    missedFirstClicks: result.missedFirstClicks, overBudget: result.overBudget }))
  if (!hz || result.missedFirstClicks.length || result.missingFrames.length || result.overBudget.length ||
    result.comparable.missingCommits.length || (idleSeconds > 0 && !idleCpu?.withinBudget)
    || result.missingWorkloads.length || workload.error || (scenario === 'models' && !workload.finished)
    || (scenario === 'streaming' && (streaming.previewEvents < 2 || result.byWorkload.streaming.trials.length !== count))) process.exitCode = 1
}
