// @vitest-environment happy-dom
import { act, useRef, type CSSProperties } from 'react'
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

function Overlay({ enabled = true, frost }: { enabled?: boolean; frost?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const status = useNativeBackdrop(ref, enabled, '[data-blur]', frost)
  return <div ref={ref} data-blur data-status={status} style={{ borderRadius: '20px', opacity: 1 }} />
}

function PreviewWithoutWindowOwner() {
  const ref = useRef<HTMLDivElement>(null)
  const status = useNativeBackdrop(ref, false, '[data-blur]')
  return <output>{status ?? 'preview'}</output>
}

const previewOptics = { bend: .65, dispersion: .42 }
function IndependentFrost({ global, local, blur, gpu }: { global: number; local?: number; blur?: number; gpu?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useNativeBackdrop(ref, true, '[data-blur]', global, local === undefined ? '' : 'usage:' + local, gpu ? previewOptics : undefined)
  return <div ref={ref}><div data-blur className="island-card" /><div data-blur
    style={{ '--glass-region-frost': local, '--glass-region-blur': blur } as CSSProperties} /></div>
}

function Recording({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const status = useNativeBackdrop(ref, true, '[data-blur]')
  return <div ref={ref}><div data-blur style={{ borderRadius: '22px', opacity: 1 }}>
    <span className="meter" style={{ height: text.length }}>{text}</span>
  </div><output>{status ?? 'pending'}</output></div>
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

it('retries a transient viewport mismatch on the next animation frame', async () => {
  vi.mocked(setOverlayBackdrop).mockResolvedValueOnce(null)
  await act(async () => root.render(<Recording text="one" />))
  expect(container.querySelector('output')?.textContent).toBe('pending')
  await act(async () => vi.advanceTimersByTimeAsync(16))
  expect(container.querySelector('output')?.textContent).toBe('pending')
  await act(async () => vi.advanceTimersByTimeAsync(32))
  expect(container.querySelector('output')?.textContent).toBe('active')
})

it('bounds the number of attempts during a persistent viewport mismatch', async () => {
  vi.mocked(setOverlayBackdrop).mockResolvedValue(null)
  await act(async () => root.render(<Recording text="one" />))
  await act(async () => vi.advanceTimersByTimeAsync(1200))
  expect(vi.mocked(setOverlayBackdrop).mock.calls.filter(([frame]) => frame.enabled)).toHaveLength(4)
  const calls = vi.mocked(setOverlayBackdrop).mock.calls.length
  await act(async () => vi.advanceTimersByTimeAsync(5000))
  expect(setOverlayBackdrop).toHaveBeenCalledTimes(calls)
})

it('does not schedule native layout reads when only speech text or meter levels change', async () => {
  await act(async () => root.render(<Recording text="one" />))
  await act(async () => vi.advanceTimersByTimeAsync(1000))
  const bounds = vi.mocked(HTMLElement.prototype.getBoundingClientRect)
  bounds.mockClear()
  for (const text of ['two', 'three', 'four']) {
    await act(async () => root.render(<Recording text={text} />))
    await act(async () => vi.advanceTimersByTimeAsync(100))
  }
  expect(bounds).not.toHaveBeenCalled()
})

it('stops observing geometry when Windows has disabled backdrop effects', async () => {
  vi.mocked(setOverlayBackdrop).mockResolvedValue(false)
  await act(async () => root.render(<Recording text="one" />))
  await act(async () => vi.advanceTimersByTimeAsync(1000))
  expect(container.querySelector('output')?.textContent).toBe('unavailable')
  expect(observed).toBe(0)
  expect(vi.mocked(setOverlayBackdrop).mock.calls.filter(([frame]) => frame.enabled)).toHaveLength(1)
})

it('adjusts frost on the same native target and skips measurements at zero', async () => {
  await act(async () => root.render(<Overlay />))
  await act(async () => vi.advanceTimersByTimeAsync(500))
  expect(vi.mocked(setOverlayBackdrop).mock.lastCall?.[0].frost).toBe(.2)
  for (const amount of [.45, 0, 1]) {
    await act(async () => root.render(<Overlay frost={amount} />))
    await act(async () => vi.advanceTimersByTimeAsync(48))
    const frame = vi.mocked(setOverlayBackdrop).mock.lastCall?.[0]
    expect(frame?.enabled).toBe(true)
    expect(frame?.frost).toBe(amount)
    expect(frame?.regions).toHaveLength(amount === 0 ? 0 : 1)
    expect(container.firstElementChild?.getAttribute('data-status')).toBe('active')
    expect(observed > 0).toBe(amount > 0)
  }
  expect(vi.mocked(setOverlayBackdrop).mock.calls.some(([frame]) => !frame.enabled)).toBe(false)
})

it('updates an independent surface when the global frost is zero and restores inheritance on reset', async () => {
  for (const [global, local, expected] of [
    [0, undefined, []], [0, .5, [.5]], [.9, 0, [undefined]], [.9, undefined, [undefined, undefined]],
  ] as const) {
    await act(async () => root.render(<IndependentFrost global={global} local={local}
      blur={local === undefined ? undefined : local * 24} />))
    await act(async () => vi.advanceTimersByTimeAsync(500))
    const regions = vi.mocked(setOverlayBackdrop).mock.lastCall?.[0].regions
    expect(regions?.map(region => region.frost)).toEqual(expected)
    expect(regions?.flatMap(region => region.blurRadius ?? [])).toEqual(local ? [local * 24] : [])
  }
})

it('publishes an optical scene only when the island body exists, even with frost at zero', async () => {
  await act(async () => root.render(<IndependentFrost global={0} local={.6} gpu />))
  await act(async () => vi.advanceTimersByTimeAsync(100))
  let frame = vi.mocked(setOverlayBackdrop).mock.lastCall?.[0]
  expect(frame?.regions).toHaveLength(2)
  expect(frame?.lens).toEqual({ region: 0, ...previewOptics })
  expect(frame?.prewarmLens).toBe(true)
  await act(async () => root.render(<IndependentFrost global={0} local={.6} />))
  await act(async () => vi.advanceTimersByTimeAsync(100))
  frame = vi.mocked(setOverlayBackdrop).mock.lastCall?.[0]
  expect(frame?.regions).toHaveLength(1)
  expect(frame?.lens).toBeUndefined()
  expect(frame?.prewarmLens).toBeUndefined()
})

it('waits for a prepared hidden body and ignores a completion from an older opening', async () => {
  const ready = vi.fn()
  let complete: (active: boolean) => void = () => {}
  vi.mocked(setOverlayBackdrop).mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
  vi.mocked(setOverlayBackdrop).mockResolvedValueOnce(null)
  const stage = (id: number) => <Staged id={id} />
  function Staged({ id }: { id: number }) {
    const ref = useRef<HTMLDivElement>(null)
    useNativeBackdrop(ref, true, '[data-blur]', .56, '', previewOptics, .56, { id, onReady: ready })
    return <div ref={ref}><div data-lens-staging style={{ opacity: 0 }}><div data-blur className="island-card" /></div></div>
  }

  await act(async () => root.render(stage(10)))
  await act(async () => vi.advanceTimersByTimeAsync(20))
  expect(vi.mocked(setOverlayBackdrop).mock.lastCall?.[0]).toMatchObject({
    stageLens: 10, regions: [{ opacity: 1 }], lens: { region: 0 },
  })
  await act(async () => root.render(stage(11)))
  await act(async () => { complete(true); await vi.advanceTimersByTimeAsync(75) })
  expect(ready.mock.calls).toEqual([[11]])
  expect(vi.mocked(setOverlayBackdrop).mock.calls.filter(([frame]) => frame.stageLens === 11)).toHaveLength(2)
})

it('identifies the island body for system frost even if GPU optics are disabled', async () => {
  await act(async () => root.render(<IndependentFrost global={1} />))
  await act(async () => vi.advanceTimersByTimeAsync(20))
  const frame = vi.mocked(setOverlayBackdrop).mock.lastCall?.[0]
  expect(frame?.islandBody).toBe(0)
  expect(frame?.frost).toBe(1)
  expect(frame?.lens).toBeUndefined()
})

it('requests capture during edge contact with no visible card and releases it when contact is abandoned', async () => {
  function Collapsed({ touching }: { touching: boolean }) {
    const ref = useRef<HTMLDivElement>(null)
    useNativeBackdrop(ref, true, '[data-blur]', .18, '', previewOptics, touching ? .56 : undefined)
    return <div ref={ref} />
  }

  await act(async () => root.render(<Collapsed touching />))
  await act(async () => vi.advanceTimersByTimeAsync(20))
  expect(vi.mocked(setOverlayBackdrop).mock.lastCall?.[0]).toMatchObject({ prepareFrost: .56, regions: [] })
  await act(async () => root.render(<Collapsed touching={false} />))
  await act(async () => vi.advanceTimersByTimeAsync(20))
  const stopped = vi.mocked(setOverlayBackdrop).mock.lastCall?.[0]
  expect(stopped?.prepareFrost).toBeUndefined()
  expect(stopped?.regions).toEqual([])
})
