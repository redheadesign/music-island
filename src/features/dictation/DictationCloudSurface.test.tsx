// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { DictationCloudSurface } from './DictationCloudSurface'
import { defaultDictationAppearance } from '../../shared/lib/dictationAppearance'

const gpu = vi.hoisted(() => ({ create: vi.fn(), render: vi.fn(), dispose: vi.fn() }))
vi.mock('./DictationCloudRenderer', () => ({
  DictationCloudRenderer: class {
    constructor() { gpu.create() }
    render = gpu.render
    dispose = gpu.dispose
  },
}))
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })

function setup() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const callbacks = new Map<number, FrameRequestCallback>()
  let sequence = 0
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => {
    callbacks.set(++sequence, callback)
    return sequence
  })
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(id => { callbacks.delete(id) })
  const container = document.createElement('div'), root = createRoot(container)
  const render = (active = true, still = false) => act(async () => root.render(
    <DictationCloudSurface appearance={{ ...defaultDictationAppearance, theme: 'pixels' }} phase="recording" levels={[.5]} active={active} still={still} />,
  ))
  const tick = (time: number) => act(async () => {
    const pending = [...callbacks.values()]
    callbacks.clear()
    pending.forEach(callback => callback(time))
  })
  return { root, container, render, tick, callbacks }
}

it('pauses GPU frames when the document is hidden and releases resources on unmount', async () => {
  const scene = setup()
  try {
    await scene.render()
    await scene.tick(100)
    await scene.tick(150)
    expect(gpu.render).toHaveBeenCalled()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    const count = gpu.render.mock.calls.length
    expect(scene.callbacks.size).toBe(0)
    await scene.tick(200)
    expect(gpu.render).toHaveBeenCalledTimes(count)
  } finally { await act(async () => scene.root.unmount()) }
  expect(gpu.dispose).toHaveBeenCalledOnce()
})

it('paints a reduced-motion surface without a continuous frame loop', async () => {
  const scene = setup()
  try {
    await scene.render(true, true)
    await scene.tick(100)
    await scene.tick(150)
    expect(gpu.render).toHaveBeenCalled()
    expect(scene.callbacks.size).toBe(0)
  } finally { await act(async () => scene.root.unmount()) }
})

it('paints fallback first, initializes only when active, and reuses the context on the next recording', async () => {
  const scene = setup()
  try {
    await scene.render(false)
    expect(gpu.create).not.toHaveBeenCalled()
    expect(scene.callbacks.size).toBe(0)
    expect(scene.container.querySelector('canvas')?.dataset.fallback).toBe('true')
    await scene.render()
    expect(gpu.create).not.toHaveBeenCalled()
    await scene.tick(100)
    expect(gpu.create).not.toHaveBeenCalled()
    await scene.tick(116)
    expect(gpu.create).toHaveBeenCalledOnce()
    expect(scene.container.querySelector('canvas')?.dataset.fallback).toBeUndefined()
    await scene.render(false)
    const count = gpu.render.mock.calls.length
    expect(scene.callbacks.size).toBe(0)
    expect(gpu.dispose).not.toHaveBeenCalled()
    await scene.tick(200)
    expect(gpu.render).toHaveBeenCalledTimes(count)
    await scene.render()
    await scene.render(true, true)
    expect(gpu.create).toHaveBeenCalledOnce()
    expect(scene.callbacks.size).toBe(0)
  } finally { await act(async () => scene.root.unmount()) }
  expect(gpu.dispose).toHaveBeenCalledOnce()
})

it('caps GPU frames on fast monitors and recovers a lost context without a recording restart', async () => {
  const scene = setup()
  try {
    await scene.render()
    await scene.tick(100)
    await scene.tick(116)
    gpu.render.mockClear()
    for (let at = 120; at <= 1120; at += 8) await scene.tick(at)
    expect(gpu.render.mock.calls.length).toBeLessThanOrEqual(31)
    expect(gpu.render.mock.calls.length).toBeGreaterThanOrEqual(24)
    const canvas = scene.container.querySelector('canvas')!
    await act(async () => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })))
    expect(scene.callbacks.size).toBe(0)
    expect(canvas.dataset.fallback).toBe('true')
    await act(async () => canvas.dispatchEvent(new Event('webglcontextrestored')))
    await scene.tick(1200)
    await scene.tick(1216)
    expect(gpu.create).toHaveBeenCalledTimes(2)
    expect(canvas.dataset.fallback).toBeUndefined()
  } finally { await act(async () => scene.root.unmount()) }
})
