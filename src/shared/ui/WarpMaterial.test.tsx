// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WarpMaterial } from './WarpMaterial'
import { StatefulWarpSurface } from './StatefulWarpSurface'
import { WarpSurfaceProvider } from './WarpSurface'
vi.mock('framer-motion', () => ({ useReducedMotion: () => false }))
const paintFoxScene = vi.hoisted(() => vi.fn())
vi.mock('./asciiScene/animalCanvas', () => ({ paintFoxScene }))

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ setTransform: vi.fn() } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(360)
  vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(140)
  paintFoxScene.mockClear()
})

afterEach(() => vi.restoreAllMocks())

function speed(host: HTMLElement) {
  return host.querySelector('[data-speed]')?.getAttribute('data-speed')
}

it.each([false, true])('changes the fox speed without replacing the canvas (shared: %s)', async (shared) => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const view = (running: boolean, reducedMotion = false) => {
    const field = <StatefulWarpSurface running={running} reducedMotion={reducedMotion} />
    return shared ? <WarpSurfaceProvider>{field}</WarpSurfaceProvider> : field
  }
  try {
    await act(async () => root.render(view(false)))
    const canvas = host.querySelector('canvas')!
    expect(canvas.dataset.asciiScene).toBe('fox')
    expect(paintFoxScene).toHaveBeenCalled()
    expect(speed(host)).toBe('0.225')
    await act(async () => root.render(view(true)))
    expect(speed(host)).toBe('1.1625')
    expect(host.querySelector('[data-running]')?.getAttribute('data-running')).toBe('true')
    await act(async () => root.render(view(true, true)))
    expect(speed(host)).toBe('0')
    await act(async () => root.render(view(false)))
    expect(speed(host)).toBe('0.225')
    expect(host.querySelector('canvas')).toBe(canvas)
  } finally { await act(async () => root.unmount()); host.remove() }
})

it('pauses inactive, hidden and reduced-motion renderers without dropping the canvas', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<WarpMaterial speed={2.1} />))
    const canvas = host.querySelector('canvas')!
    expect(speed(host)).toBe('2.1')
    await act(async () => root.render(<WarpMaterial active={false} />))
    expect(host.querySelector('canvas')).toBe(canvas); expect(speed(host)).toBe('0')
    await act(async () => root.render(<WarpMaterial reducedMotion />))
    expect(speed(host)).toBe('0')
    await act(async () => root.render(<WarpMaterial />))
    expect(speed(host)).toBe('0.225')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(speed(host)).toBe('0')
    await act(async () => root.render(<WarpMaterial frame={1234} />))
    expect(paintFoxScene).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ time: 1.234 })); expect(host.querySelector('canvas')).toBe(canvas)
  } finally { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() }
})

it('prewarms deferred fields only near the viewport and retains the same canvas on revisit', async () => {
  const observers: { callback: IntersectionObserverCallback; margin?: string }[] = []
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) { observers.push({ callback, margin: options?.rootMargin }) }
    observe() {} disconnect() {}
  })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  const intersect = (observer: typeof observers[number], value: boolean) => observer.callback([{ isIntersecting: value } as IntersectionObserverEntry], {} as IntersectionObserver)
  try {
    await act(async () => root.render(<WarpMaterial deferUntilNearViewport speed={2.1} />))
    expect(host.querySelector('canvas')).toBeNull()
    const preparation = observers.find(observer => observer.margin === '600px')!
    const visibility = observers.find(observer => !observer.margin)!
    await act(async () => { intersect(visibility, false); intersect(preparation, true) })
    const canvas = host.querySelector('canvas')!
    expect(speed(host)).toBe('0')
    await act(async () => intersect(visibility, true))
    expect(speed(host)).toBe('2.1')
    await act(async () => intersect(visibility, false))
    await act(async () => root.render(<WarpMaterial deferUntilNearViewport speed={2.1} />))
    await act(async () => intersect(visibility, true))
    expect(host.querySelector('canvas')).toBe(canvas)
    expect(speed(host)).toBe('2.1')
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() }
})

it('renders deterministic deferred exports immediately', async () => {
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<WarpMaterial deferUntilNearViewport frame={4200} />))
    expect(paintFoxScene).toHaveBeenLastCalledWith(expect.anything(), { time: 4.2, width: 360, height: 140 })
  } finally { await act(async () => root.unmount()); host.remove() }
})
