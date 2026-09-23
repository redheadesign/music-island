// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDictationShortcut } from './useDictationShortcut'
import type { DictationController } from './useDictationController'

const native = vi.hoisted(() => ({ listener: null as null | ((event: { payload: unknown }) => void), dispose: vi.fn() }))
vi.mock('./dictationEvents', () => ({ listenDictationEvent: vi.fn(async (_: string, callback: typeof native.listener) => { native.listener = callback; return native.dispose }) }))
let root: Root
let current: ReturnType<typeof useDictationShortcut>
let api: DictationController['api']
function Probe() {
  current = useDictationShortcut({ api, run: async (_id, action) => { await action() } } as DictationController, 'transcribe')
  return null
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  api = { startHandyKeysRecording: vi.fn(async () => null), stopHandyKeysRecording: vi.fn(async () => null), changeBinding: vi.fn(async () => ({ success: true, error: null, binding: null })) } as unknown as DictationController['api']
  root = createRoot(document.createElement('div'))
  await act(async () => root.render(<Probe />))
})
afterEach(async () => { await act(async () => root.unmount()) })
async function key(payload: { key: string | null; modifiers: string[]; is_key_down: boolean; hotkey_string: string }) {
  await act(async () => native.listener?.({ payload }))
}
it('commits the complete shortcut on key release, without saving a modifier early', async () => {
  await act(async () => current.start())
  await key({ key: null, modifiers: ['ctrl'], is_key_down: true, hotkey_string: 'ctrl' })
  await key({ key: 'space', modifiers: ['ctrl'], is_key_down: true, hotkey_string: 'ctrl+space' })
  await key({ key: null, modifiers: [], is_key_down: false, hotkey_string: '' })
  expect(api.changeBinding).not.toHaveBeenCalled()
  await key({ key: 'space', modifiers: [], is_key_down: false, hotkey_string: 'space' })
  expect(api.changeBinding).toHaveBeenCalledExactlyOnceWith('transcribe', 'ctrl+space')
  expect(api.stopHandyKeysRecording).toHaveBeenCalledOnce()
})
it('waits until all modifiers are released for a modifier-only shortcut', async () => {
  await act(async () => current.start())
  await key({ key: null, modifiers: ['ctrl', 'shift'], is_key_down: true, hotkey_string: 'ctrl+shift' })
  await key({ key: null, modifiers: ['shift'], is_key_down: false, hotkey_string: 'shift' })
  expect(api.changeBinding).not.toHaveBeenCalled()
  await key({ key: null, modifiers: [], is_key_down: false, hotkey_string: '' })
  expect(api.changeBinding).toHaveBeenCalledExactlyOnceWith('transcribe', 'ctrl+shift')
})
it('Escape stops capture without changing the binding', async () => {
  await act(async () => current.start())
  await key({ key: 'escape', modifiers: [], is_key_down: true, hotkey_string: 'escape' })
  expect(api.changeBinding).not.toHaveBeenCalled()
  expect(api.stopHandyKeysRecording).toHaveBeenCalledOnce()
  expect(native.dispose).toHaveBeenCalledOnce()
})
it('stops a late native start after leaving the page', async () => {
  let resolve!: () => void
  vi.mocked(api.startHandyKeysRecording).mockImplementation(() => new Promise<null>((done) => { resolve = () => done(null) }))
  let start!: Promise<void>
  await act(async () => { start = current.start() })
  await act(async () => root.render(null))
  await act(async () => { resolve(); await start })
  expect(api.stopHandyKeysRecording).toHaveBeenCalledTimes(2)
  expect(api.changeBinding).not.toHaveBeenCalled()
})
