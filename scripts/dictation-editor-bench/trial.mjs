import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { access, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright-core'

const trial = path.resolve(process.argv[2])
const file = name => path.join(trial, name)
const json = async name => JSON.parse(await readFile(file(name), 'utf8'))
const meta = await json('trial.json')
assert.equal(path.basename(trial), meta.case)
assert.match(meta.nonce, /^[a-f0-9]{32}$/)
const editor = path.join(meta.tools, 'editor.exe')
const audio = path.join(meta.tools, 'audio.exe')
const options = {
  cwd: trial, windowsHide: true,
  env: { ...process.env, MUSIC_ISLAND_EDITOR_RUN: trial, MUSIC_ISLAND_EDITOR_NONCE: meta.nonce },
}
const execute = promisify(execFile)
const command = (...args) => execute(editor, ['--bench', ...args], { ...options, timeout: 8000 })
async function wait(description, check, timeout = 20000, interval = 150) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const hit = await check()
    if (hit) return hit
    await sleep(interval)
  }
  throw Error('Timeout: ' + description)
}
const locator = 'http://127.0.0.1:' + meta.port
const browser = await chromium.connectOverCDP(locator)
const root = file('Roaming/Music Island')
const plugin = 'plugin:dictation|'
let controller, held, host, rendering
const timeline = []
const started = Date.now()
function stage(event) {
  timeline.push({ event, elapsedMs: Date.now() - started })
  console.log(meta.case, event)
}
try {
  const page = await wait('isolated settings WebView', async () => {
    for (const p of browser.contexts().flatMap(c => c.pages())) {
      if (!/^https?:\/\/tauri\.localhost(?:\/|$)/.test(p.url())) continue
      const label = await p.evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label).catch(() => null)
      if (label === 'settings') return p
    }
  })
  const invoke = (cmd, args = {}) => page.evaluate(([cmd, args]) => window.__TAURI_INTERNALS__.invoke(cmd, args), [cmd, args])
  controller = (cmd, args) => invoke(plugin + cmd, args)
  const constraint = { requiredInput: meta.capture.name, predecode: meta.mode === 'candidate' }
  const status = async () => {
    const s = await controller('get_status')
    assert.deepEqual(s.captureConstraint, constraint, 'App must explicitly prohibit fallback microphones')
    if (s.error) throw Error('Native dictation: ' + s.error)
    return s
  }
  const initial = await status()
  assert.ok(!initial.ready)
  stage('strict capture confirmed')
  const configPath = path.join(root, 'config.json')
  assert.equal(await readFile(configPath, 'utf8'), '{bench-protected')
  await wait('post-startup marker', async () => (await readFile(path.join(root, 'logs/app.log'), 'utf8').catch(() => '')).includes('media watcher started'))
  await unlink(configPath)
  const config = await invoke('get_config')
  assert.equal(config.media.protocol, 'smtc')
  assert.equal(config.media.directYandexConsent, false)
  assert.ok(!config.plugins.enabled.includes('dictation'))
  const prefs = await controller('get_app_settings')
  for (const [key, expected] of Object.entries({
    always_on_microphone: false, selected_microphone: constraint.requiredInput, audio_feedback: false,
    mute_while_recording: false, post_process_enabled: false, paste_method: 'external_script',
    clipboard_handling: 'dont_modify', auto_submit: false, external_script_path: editor,
    selected_model: meta.modelId, shortcut_activation: 'push_to_talk', transcribe_accelerator: 'vulkan',
  })) assert.equal(prefs[key], expected, 'Unsafe or unexpected preference: ' + key)
  assert.equal(prefs.bindings.transcribe.current_binding.toLowerCase(), 'f24')
  const microphones = await controller('get_available_microphones')
  assert.equal(microphones.filter(m => m.name === constraint.requiredInput).length, 1)
  const model = (await controller('get_available_models')).find(m => m.id === meta.modelId)
  assert.ok(model?.is_downloaded, 'Staged Q8_0 is absent')
  stage('isolated preferences, endpoints and model verified')
  await controller('initialize')
  const getLoad = () => controller('get_model_load_status')
  await wait('loading settled', async () => !(await status()).modelLoading, 90000)
  if (!(await getLoad()).is_loaded) await controller('set_active_model', { modelId: meta.modelId })
  const loaded = await getLoad()
  assert.equal(loaded.current_model, meta.modelId)
  assert.ok(loaded.is_loaded)
  assert.match(loaded.backend ?? '', /vulkan/i)
  stage('model warm on ' + loaded.backend)
  host = spawn(editor, ['--bench', 'host'], { ...options, stdio: 'ignore' })
  const ready = await wait('our editor to receive input', async () => (await readFile(file('editor-ready'), 'utf8').catch(() => '')))
  assert.equal(Number(ready), host.pid)
  await status()
  await execute(audio, ['idle', meta.render.id], options)
  await command('press')
  held = true
  const active = await wait('native push-to-talk recording', async () => {
    const s = await status()
    return s.operationId > initial.operationId && s.ready && ['recording','streaming'].includes(s.phase) && s
  }, 15000)
  stage('recording')
  await new Promise((resolve, reject) => {
    rendering = execFile(audio, ['render', meta.render.id, meta.audio], options, (error, stdout, stderr) => {
      if (error) reject(Error('Explicit render failed: ' + stderr + ' ' + error.message))
      else resolve(stdout)
    })
  })
  await sleep(150)
  const last = await status()
  assert.equal(last.operationId, active.operationId)
  assert.ok(last.ready)
  await command('release')
  held = false
  stage('keyup')
  const progress = []
  const metrics = await wait('native editor EN_CHANGE', async () => {
    try { return await json('editor-metrics.json') }
    catch (err) { if (!(err.code === 'ENOENT' || err instanceof SyntaxError)) throw err }
    const s = await status()
    if (s.progress && progress.at(-1)?.completedAudioMs !== s.progress.completedAudioMs) progress.push(s.progress)
    return false
  }, 180000, 85)
  const transcript = await readFile(file('editor.txt'), 'utf8')
  assert.ok(transcript.trim())
  assert.ok(metrics.enChange >= metrics.releaseReturned && metrics.releaseReturned >= metrics.release)
  const entries = await wait('saved History transcript', async () => {
    const { entries } = await controller('get_history_entries', { cursor: null, limit: 2 })
    return entries.some(e => e.transcription_text?.trim()) && entries
  })
  assert.equal(entries.length, 1)
  assert.equal(entries[0].post_process_requested, false)
  assert.equal(transcript.trim(), entries[0].transcription_text.trim())
  const historyWav = await controller('get_audio_file_path', { fileName: entries[0].file_name })
  const recDir = path.join(root, 'dictation', 'recordings')
  assert.equal(path.dirname(path.resolve(historyWav)).toLowerCase(), recDir.toLowerCase())
  await access(historyWav)
  const nativeLogs = await Promise.all(['logs/app.log','dictation/logs/lifecycle.log'].map(f => readFile(path.join(root, f), 'utf8')))
  const lines = nativeLogs.join('\n').split(/\r?\n/)
  const lifecycle = lines.filter(l => /predecode|backend=|fallback/i.test(l))
  const captureDropEvents = lines.filter(l => /Microphone capture ring dropped|Active recording completed after dropping/i.test(l))
  const ms = (end, begin) => (end - begin) * 1000 / metrics.frequency
  const result = {
    case: meta.case, mode: meta.mode, audio: meta.audio, reference: meta.reference, latencyMs: ms(metrics.enChange, metrics.release),
    inputCallMs: ms(metrics.releaseReturned, metrics.release), rawCounter: metrics, transcript, historyWav, progress, lifecycle, captureDropEvents, timeline,
    captureConstraint: constraint, renderEndpoint: meta.render, model: loaded, hashes: { app: meta.executableHash, audio: meta.audioHash, reference: meta.referenceHash },
    delivery: 'Windows SendInput F24 key-up to EN_CHANGE in peer editor, via ExternalScript', operationId: active.operationId,
  }
  await writeFile(file('report.json'), JSON.stringify(result, null, 2))
  console.log(meta.case, Math.round(result.latencyMs) + ' ms', JSON.stringify(transcript.slice(0, 100)))
} catch (error) {
  await writeFile(file('error.json'), JSON.stringify({ error: String(error?.stack ?? error), timeline }, null, 2))
  throw error
} finally {
  if (rendering && rendering.exitCode === null) rendering.kill()
  if (held) await command('release').catch(() => {})
  if (host) {
    await command('close').catch(() => {})
    if (host.exitCode === null) host.kill()
  }
  await browser.close()
}
