import assert from 'node:assert/strict'
import test from 'node:test'
import { observeWorkload, overlaps } from './workload.mjs'

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
