// @vitest-environment happy-dom
import { act, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { setOverlayBackdrop, type NativeBackdropFrame } from '../tauriApi'
import { useNativeBackdrop } from './useNativeBackdrop'

vi.mock('../tauriApi', () => ({ setOverlayBackdrop: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

let root: ReturnType<typeof createRoot>
let container: HTMLDivElement
let notifyResize: () => void
let observed: number
let width = 240

function Overlay({ enabled = true }: { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useNativeBackdrop(ref, enabled, '[data-blur]')
  return <div ref={ref} data-blur style={{ borderRadius: '20px', opacity: 1 }} />
}

function PreviewWithoutWindowOwner() {
  const ref = useRef<HTMLDivElement>(null)
  const status = useNativeBackdrop(ref, false, '[data-blur]')
  return <output>{status ?? 'preview'}</output>
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.assign(window, { __TAURI_INTERNALS__: {} })
  vi.useFakeTimers()
  vi.clearAllMocks()
  width = 240
  observed = 0
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { notifyResize = callback }
    observe() { observed += 1 }
    disconnect() { observed = 0 }
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ x: 40, y: 0, left: 40, top: 0, width, height: 80, right: 40 + width, bottom: 80, toJSON() {} }))
  vi.mocked(setOverlayBackdrop).mockResolvedValue(true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('publishes the final geometry after a slow IPC without creating an unbounded queue', async () => {
  let finish: (active: boolean) => void = () => {}
  vi.mocked(setOverlayBackdrop).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await act(async () => root.render(<Overlay />))
  await act(async () => vi.advanceTimersByTimeAsync(16))
  expect(setOverlayBackdrop).toHaveBeenCalledTimes(1)
  expect(vi.mocked(setOverlayBackdrop).mock.calls[0][0].regions[0].width).toBe(240)
  width = 400
  await act(async () => {
    notifyResize()
    await vi.advanceTimersByTimeAsync(700)
  })
  expect(setOverlayBackdrop).toHaveBeenCalledTimes(1)
  await act(async () => { finish(true); await vi.advanceTimersByTimeAsync(20) })
  expect(setOverlayBackdrop).toHaveBeenCalledTimes(2)
  expect(vi.mocked(setOverlayBackdrop).mock.calls[1][0].regions[0].width).toBe(400)
})

it('clears a disabled overlay once and stops observing the visual subtree', async () => {
  await act(async () => root.render(<Overlay />))
  await act(async () => vi.advanceTimersByTimeAsync(30))
  expect(observed).toBeGreaterThan(0)
  await act(async () => root.render(<Overlay enabled={false} />))
  expect(observed).toBe(0)
  await act(async () => vi.advanceTimersByTimeAsync(30))
  const last = vi.mocked(setOverlayBackdrop).mock.lastCall?.[0] as NativeBackdropFrame
  expect(last.enabled).toBe(false)
  expect(last.regions).toEqual([])
  const calls = vi.mocked(setOverlayBackdrop).mock.calls.length
  await act(async () => vi.advanceTimersByTimeAsync(5000))
  expect(setOverlayBackdrop).toHaveBeenCalledTimes(calls)
})

it('clears its native surface on unmount and ignores a late successful response', async () => {
  let finish: (active: boolean) => void = () => {}
  vi.mocked(setOverlayBackdrop).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await act(async () => root.render(<Overlay />))
  await act(async () => vi.advanceTimersByTimeAsync(20))
  const start = vi.mocked(setOverlayBackdrop).mock.calls[0][0]
  await act(async () => root.render(null))
  const clear = vi.mocked(setOverlayBackdrop).mock.lastCall?.[0] as NativeBackdropFrame
  expect(clear.enabled).toBe(false)
  expect(clear.generation).toBeGreaterThan(start.generation)
  const calls = vi.mocked(setOverlayBackdrop).mock.calls.length
  await act(async () => { finish(true); await vi.advanceTimersByTimeAsync(500) })
  expect(setOverlayBackdrop).toHaveBeenCalledTimes(calls)
})

it('leaves a settings preview without an overlay owner entirely local', async () => {
  await act(async () => root.render(<PreviewWithoutWindowOwner />))
  await act(async () => vi.advanceTimersByTimeAsync(1000))
  expect(setOverlayBackdrop).not.toHaveBeenCalled()
  expect(container.textContent).toBe('preview')
  expect(observed).toBe(0)
})
