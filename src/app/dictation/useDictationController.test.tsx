// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HistoryEntry } from '../../shared/lib/dictationTypes'
import { useDictationController } from './useDictationController'

const api = vi.hoisted(() => ({
  initialize: vi.fn(async () => {}), suspend: vi.fn(async () => {}),
  getAppSettings: vi.fn(async () => ({})), getAvailableModels: vi.fn(async () => []),
  getAvailableMicrophones: vi.fn(async () => []),
  getHistoryEntries: vi.fn<(cursor: number | null, limit: number) => Promise<{entries: HistoryEntry[]; has_more: boolean}>>(async () => ({ entries: [], has_more: false })),
  getAppDirPath: vi.fn(async () => 'owned-data'),
  getModelLoadStatus: vi.fn(async () => ({ is_loaded: false, current_model: null })),
  getStatus: vi.fn(async () => ({ revision: 0, operationId: 0, phase: 'idle', ready: false, text: '', error: null })),
}))
vi.mock('./dictationApi', () => ({ dictationApi: api }))
vi.mock('./dictationEvents', () => ({ listenDictationEvent: vi.fn(async () => () => {}) }))
let root: Root
let controller: ReturnType<typeof useDictationController>
function Probe() { controller = useDictationController(true); return null }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  api.initialize.mockImplementation(async () => {})
  root = createRoot(document.createElement('div'))
  await act(async () => root.render(<Probe />))
})
afterEach(async () => { await act(async () => root.unmount()) })

it('does not refresh or re-enable after stale initialization; disk metadata remains available', async () => {
  let finish!: () => void
  api.initialize.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve }))
  let enabling!: Promise<void>
  await act(async () => { enabling = controller.enable() })
  await act(async () => controller.disable())
  const snapshot = controller.data
  const reads = api.getAppSettings.mock.calls.length
  await act(async () => { finish(); await enabling })
  expect(controller.data).toBe(snapshot)
  expect(controller.enabled).toBe(false)
  expect(api.getAppSettings).toHaveBeenCalledTimes(reads)
})

it('ignores completion of an operation from the previous enabled session', async () => {
  await act(async () => controller.enable())
  let finish!: () => void
  let operation!: Promise<void>
  await act(async () => {
    operation = controller.run('download', () => new Promise<void>((resolve) => { finish = resolve }))
  })
  await act(async () => controller.disable())
  const snapshot = controller.data
  const reads = api.getAppSettings.mock.calls.length
  await act(async () => { finish(); await operation })
  expect(controller.data).toBe(snapshot)
  expect(api.getAppSettings).toHaveBeenCalledTimes(reads)
})

it('loads history beyond the native 100-entry page limit using cursors', async () => {
  const history = Array.from({ length: 160 }, (_, index) => ({ id: 160 - index }) as HistoryEntry)
  api.getHistoryEntries.mockImplementation(async (cursor, limit) => {
    const remaining = history.filter(entry => cursor == null || entry.id < cursor)
    return { entries: remaining.slice(0, Math.min(limit, 100)), has_more: remaining.length > limit }
  })
  await act(async () => controller.loadMoreHistory())
  await act(async () => controller.loadMoreHistory())
  expect(controller.data?.history).toHaveLength(150)
  expect(controller.data?.hasMoreHistory).toBe(true)
  await act(async () => controller.loadMoreHistory())
  expect(controller.data?.history).toHaveLength(160)
  expect(controller.data?.hasMoreHistory).toBe(false)
  expect(new Set(controller.data?.history.map(entry => entry.id)).size).toBe(160)
})
