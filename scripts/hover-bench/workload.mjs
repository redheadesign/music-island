// Runs inside the benchmark's WebView. Keep only phase names and timestamps.
export async function observeWorkload() {
  const { invoke, transformCallback } = window.__TAURI_INTERNALS__
  const spans = []
  const active = new Map()
  const now = () => performance.timeOrigin + performance.now()
  function begin(name, id) {
    const key = name + '/' + id
    if (active.has(key)) return
    const span = { name, id, start: now(), end: null }
    active.set(key, span)
    spans.push(span)
  }
  function end(name, id) {
    const key = name + '/' + id
    const span = active.get(key)
    if (span) { span.end = now(); active.delete(key) }
  }
  const handlers = {
    'model-download-progress': data => {
      if (data.total > 0 && data.downloaded >= data.total) end('download', data.model_id)
      else begin('download', data.model_id)
    },
    'model-verification-started': id => { end('download', id); begin('hash', id) },
    'model-verification-completed': id => end('hash', id),
    'model-state-changed': data => {
      if (data.event_type === 'loading_started') begin('load', data.model_id)
      if (['loading_completed', 'loading_failed'].includes(data.event_type)) end('load', data.model_id)
    },
    'model-download-failed': data => { end('download', data.model_id); end('hash', data.model_id) },
    'dictation:status': data => {
      if (data.phase === 'streaming' && data.ready) begin('streaming', data.operationId)
      else end('streaming', data.operationId)
    },
  }
  await Promise.all(Object.entries(handlers).map(([event, handler]) => invoke('plugin:event|listen',
    { event, target: { kind: 'Any' }, handler: transformCallback(message => handler(message.payload)) })))
  window.__hoverWorkload = { spans, finished: false, error: null }
}

// Uses the same public commands as the dictation settings screen, in the same
// process as the overlay. The 'small' direct-HTTP entry verifies its pinned SHA.
export function startModelWorkload(modelId) {
  const state = window.__hoverWorkload
  state.finished = false
  state.error = null
  const invoke = window.__TAURI_INTERNALS__.invoke
  void (async () => {
    await invoke('set_plugin_enabled', { id: 'dictation', enabled: true })
    await invoke('plugin:dictation|initialize')
    const models = await invoke('plugin:dictation|get_available_models')
    const model = models.find(candidate => candidate.id === modelId)
    if (!model || model.is_downloaded) throw Error('Model must be available for a fresh download: ' + modelId)
    await invoke('plugin:dictation|download_model', { modelId })
    await invoke('plugin:dictation|set_model_unload_timeout', { timeout: 'never' })
    await invoke('plugin:dictation|set_active_model', { modelId })
    const status = await invoke('plugin:dictation|get_model_load_status')
    if (!status.is_loaded) throw Error('Model did not finish loading')
  })().catch(error => { state.error = String(error) }).finally(() => { state.finished = true })
}

export function overlaps(span, start, end) {
  return Number.isFinite(start) && Number.isFinite(end) && span.start <= end && (span.end == null || span.end >= start)
}

export function idleCpuMetrics(samples, logicalProcessors, expectedMs) {
  const first = samples[0], last = samples.at(-1)
  const ids = Object.keys(first.cpuMs).sort()
  const elapsedMs = last.at - first.at
  const sameProcesses = samples.every(sample => {
    const keys = Object.keys(sample.cpuMs).sort()
    return keys.length === ids.length && keys.every((key, i) => key === ids[i])
  })
  const valid = sameProcesses && logicalProcessors > 0 && elapsedMs >= expectedMs && elapsedMs > 0 &&
    samples.every((sample, i) => sample.rootFound && sample.webviews > 0 && (!i || sample.at > samples[i - 1].at) &&
      ids.every(id => Number.isFinite(sample.cpuMs[id]) && (!i || sample.cpuMs[id] >= samples[i - 1].cpuMs[id])))
  const cpuMs = valid ? ids.reduce((total, id) => total + last.cpuMs[id] - first.cpuMs[id], 0) : null
  const oneCorePercent = valid ? 100 * cpuMs / elapsedMs : null
  const machinePercent = valid ? oneCorePercent / logicalProcessors : null
  return { valid, cpuMs, elapsedMs, oneCorePercent, machinePercent, limitMachinePercent: 1,
    withinBudget: valid && machinePercent <= 1, logicalProcessors, processCount: ids.length,
    processSetChanged: !sameProcesses, sampleCount: samples.length }
}
