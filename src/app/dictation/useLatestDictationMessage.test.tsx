// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LatestDictationMessage } from '../../shared/lib/dictationTypes'
import { useLatestDictationMessage } from './useLatestDictationMessage'

const bridge = vi.hoisted(() => ({
  read: vi.fn<() => Promise<LatestDictationMessage | null>>(),
  copy: vi.fn(async (_id: number) => {}),
  listen: vi.fn(),
  unlisten: vi.fn(),
}))
vi.mock('./dictationApi', () => ({ dictationApi: { getLatestHistoryMessage: bridge.read, copyHistoryMessage: bridge.copy } }))
vi.mock('./dictationEvents', () => ({ listenDictationEvent: bridge.listen }))

let root: Root
let current: ReturnType<typeof useLatestDictationMessage>
let notify: (event: { payload: { action: string } }) => void
const old = { id: 1, timestamp: 10, text: 'Old text' }
const latest = { id: 2, timestamp: 10, text: 'Latest text' }

function Probe({ enabled }: { enabled: boolean }) {
  current = useLatestDictationMessage(enabled)
  return null
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
  bridge.listen.mockImplementation(async (_event, callback) => {
    notify = callback
    return bridge.unlisten
  })
  root = createRoot(document.createElement('div'))
})

afterEach(async () => {
  await act(async () => root.unmount())
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  vi.unstubAllGlobals()
})

it('waits for opt-in and ignores a stale read while new history is being saved', async () => {
  let finish!: (entry: LatestDictationMessage) => void
  bridge.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(latest)
  await act(async () => root.render(<Probe enabled={false} />))
  expect(bridge.read).not.toHaveBeenCalled()
  await act(async () => root.render(<Probe enabled />))
  expect(bridge.listen).toHaveBeenCalledWith('history-update-payload', expect.any(Function))
  await act(async () => {
    notify({ payload: { action: 'added' } })
    notify({ payload: { action: 'updated' } })
    finish(old)
  })
  expect(bridge.read).toHaveBeenCalledTimes(2)
  expect(current.message).toEqual(latest)
  await current.copy(latest.id)
  expect(bridge.copy).toHaveBeenCalledWith(latest.id)
})

it('clears deleted history and disconnects as soon as the setting is turned off', async () => {
  bridge.read.mockResolvedValueOnce(latest).mockResolvedValueOnce(null)
  await act(async () => root.render(<Probe enabled />))
  expect(current.message).toEqual(latest)
  await act(async () => notify({ payload: { action: 'deleted' } }))
  expect(current.message).toBeNull()
  await act(async () => root.render(<Probe enabled={false} />))
  expect(bridge.unlisten).toHaveBeenCalledOnce()
  await act(async () => notify({ payload: { action: 'added' } }))
  expect(bridge.read).toHaveBeenCalledTimes(2)
})
