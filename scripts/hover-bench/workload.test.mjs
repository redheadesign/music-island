import assert from 'node:assert/strict'
import test from 'node:test'
import { idleCpuMetrics, observeWorkload, overlaps, startModelWorkload } from './workload.mjs'

test('workload spans use native phase boundaries and exclude intervening idle trials', async () => {
  const events = new Map()
  globalThis.window = { __TAURI_INTERNALS__: {
    transformCallback: callback => callback,
    invoke: async (command, { event, handler }) => {
      assert.equal(command, 'plugin:event|listen')
      events.set(event, payload => handler({ payload }))
    },
  } }
  try {
    await observeWorkload()
    const { spans } = window.__hoverWorkload
    events.get('model-download-progress')({ model_id: 'small', downloaded: 10, total: 100 })
    events.get('model-download-progress')({ model_id: 'small', downloaded: 40, total: 100 })
    assert.equal(spans.length, 1)
    events.get('model-verification-started')('small')
    events.get('model-verification-completed')('small')
    events.get('model-state-changed')({ model_id: 'small', event_type: 'loading_started' })
    events.get('model-state-changed')({ model_id: 'small', event_type: 'loading_completed' })
    events.get('dictation:status')({ phase: 'streaming', operationId: 7, ready: true })
    events.get('dictation:status')({ phase: 'cancelled', operationId: 7 })
    assert.deepEqual(spans.map(s => s.name), ['download', 'hash', 'load', 'streaming'])
    assert.ok(spans.every(s => Number.isFinite(s.end) && s.start <= s.end))
    assert.ok(overlaps({ start: 2, end: 3 }, 1, 2))
    assert.ok(!overlaps({ start: 2, end: 3 }, 4, 5))
    assert.ok(!overlaps({ start: 2, end: null }, null, 5))
    assert.ok(overlaps({ start: 2, end: null }, 4, 5))
  } finally { delete globalThis.window }
})

test('successive model runs reset completion and surface native download errors', async () => {
  const calls = []
  const state = { finished: true, error: 'previous error' }
  globalThis.window = { __hoverWorkload: state, __TAURI_INTERNALS__: {
    invoke: async (command, args) => {
      calls.push(command)
      if (command.endsWith('get_available_models')) return [{ id: 'first' }, { id: 'second' }]
      if (args?.modelId === 'second' && command.endsWith('download_model')) throw Error('Upstream unavailable')
      if (command.endsWith('get_model_load_status')) return { is_loaded: true }
    },
  } }
  try {
    startModelWorkload('first')
    assert.equal(state.finished, false)
    await new Promise(resolve => setImmediate(resolve))
    assert.ok(state.finished && !state.error)
    assert.ok(calls.includes('plugin:dictation|set_active_model'))
    startModelWorkload('second')
    assert.equal(state.finished, false)
    await new Promise(resolve => setImmediate(resolve))
    assert.ok(state.finished && state.error.includes('Upstream unavailable'))
  } finally { delete globalThis.window }
})

test('idle CPU uses machine capacity, rejects transient processes and fails above one percent', () => {
  const snapshot = (at, cpuMs) => ({ at, cpuMs, rootFound: true, webviews: 1 })
  const first = snapshot(0, { app: 20, web: 10 })
  const middle = snapshot(500, { app: 30, web: 15 })
  const last = snapshot(1000, { app: 40, web: 20 })
  const valid = idleCpuMetrics([first, middle, last], 4, 1000)
  assert.equal(valid.oneCorePercent, 3)
  assert.equal(valid.machinePercent, .75)
  assert.ok(valid.withinBudget)
  assert.equal(idleCpuMetrics([first, last], 2, 1000).withinBudget, false)
  assert.equal(idleCpuMetrics([first, { ...middle, cpuMs: { ...middle.cpuMs, helper: 0 } }, last], 4, 1000).valid, false)
  assert.equal(idleCpuMetrics([first, { ...last, webviews: 0 }], 4, 1000).valid, false)
})
