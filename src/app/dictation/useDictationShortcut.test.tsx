// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDictationShortcut } from './useDictationShortcut'
import type { DictationController } from './useDictationController'
vi.mock('./dictationEvents', () => ({ listenDictationEvent: vi.fn(async () => () => {}) }))
let root: Root
let current: ReturnType<typeof useDictationShortcut>
let api: DictationController['api']
let id = 'transcribe'
function Probe() {
  current = useDictationShortcut({ api, run: async (_id, action) => { await action() } } as DictationController, id)
  return null
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  id = 'transcribe'
  api = { startHandyKeysRecording: vi.fn(async () => null), stopHandyKeysRecording: vi.fn(async () => null), suspendAllBindings: vi.fn(async () => null), resumeAllBindings: vi.fn(async () => null), changeBinding: vi.fn(async () => ({ success: true, error: null, binding: null })) } as unknown as DictationController['api']
  root = createRoot(document.createElement('div'))
  await act(async () => root.render(<Probe />))
})
afterEach(async () => { await act(async () => root.unmount()) })
async function key(type: 'keydown' | 'keyup', code: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent(type, { key: code, code, bubbles: true, cancelable: true, ...options })
  await act(async () => { window.dispatchEvent(event) })
  return event
}
it('captures WebView keys without waiting for native listener events, and saves only on release', async () => {
  await act(async () => current.start())
  await key('keydown', 'ControlLeft', { ctrlKey: true })
  const down = await key('keydown', 'Space', { key: ' ', ctrlKey: true })
  expect(down.defaultPrevented).toBe(true)
  expect(current.keys).toBe('ctrl_left+space')
  await key('keyup', 'ControlLeft')
  expect(api.changeBinding).not.toHaveBeenCalled()
  await key('keyup', 'Space', { key: ' ' })
  expect(api.changeBinding).toHaveBeenCalledExactlyOnceWith('transcribe', 'ctrl_left+space')
  expect(api.resumeAllBindings).toHaveBeenCalledOnce()
})
it('waits for all modifiers on modifier-only shortcuts', async () => {
  await act(async () => current.start())
  await key('keydown', 'ControlLeft', { ctrlKey: true })
  await key('keydown', 'ShiftRight', { ctrlKey: true, shiftKey: true })
  await key('keyup', 'ControlLeft', { shiftKey: true })
  expect(api.changeBinding).not.toHaveBeenCalled()
  await key('keyup', 'ShiftRight')
  expect(api.changeBinding).toHaveBeenCalledExactlyOnceWith('transcribe', 'ctrl_left+shift_right')
})
it('uses physical keys on Russian layouts and suppresses Tab focus navigation', async () => {
  await act(async () => current.start())
  await key('keydown', 'KeyF', { key: 'а', ctrlKey: true })
  await key('keyup', 'KeyF', { key: 'а', ctrlKey: true })
  expect(api.changeBinding).toHaveBeenLastCalledWith('transcribe', 'ctrl+f')
  await act(async () => current.start())
  expect((await key('keydown', 'Tab', { key: 'Tab', altKey: true })).defaultPrevented).toBe(true)
  await key('keyup', 'Tab', { altKey: true })
  expect(api.changeBinding).toHaveBeenLastCalledWith('transcribe', 'alt+tab')
})
it('Escape cancels and window blur restores bindings without saving', async () => {
  await act(async () => current.start())
  await key('keydown', 'Escape', { key: 'Escape' })
  expect(api.changeBinding).not.toHaveBeenCalled()
  expect(current.recording).toBe(false)
  await act(async () => current.start())
  await act(async () => { window.dispatchEvent(new Event('blur')) })
  expect(api.changeBinding).not.toHaveBeenCalled()
  expect(api.resumeAllBindings).toHaveBeenCalledTimes(2)
})
it('can assign Escape to cancel recording and ignores the activation key release', async () => {
  id = 'cancel'
  await act(async () => root.render(<Probe />))
  await act(async () => current.start())
  await key('keyup', 'Enter')
  expect(api.changeBinding).not.toHaveBeenCalled()
  await key('keydown', 'Escape', { key: 'Escape' })
  await key('keyup', 'Escape', { key: 'Escape' })
  expect(api.changeBinding).toHaveBeenCalledExactlyOnceWith('cancel', 'escape')
})
it('restores bindings after a failed save', async () => {
  vi.mocked(api.changeBinding).mockRejectedValue(new Error('Registration failed'))
  await act(async () => current.start())
  await key('keydown', 'F8'); await key('keyup', 'F8')
  expect(current.error).toContain('Registration failed')
  expect(api.resumeAllBindings).toHaveBeenCalledOnce()
})
it('cancels a late start on unmount and restores shortcuts after suspension completes', async () => {
  let resolve!: () => void
  vi.mocked(api.suspendAllBindings).mockImplementation(() => new Promise<null>(done => { resolve = () => done(null) }))
  let start!: Promise<void>
  await act(async () => { start = current.start() })
  await act(async () => root.render(null))
  await act(async () => { resolve(); await start })
  expect(api.resumeAllBindings).toHaveBeenCalledOnce()
  expect(api.changeBinding).not.toHaveBeenCalled()
})
