// @vitest-environment happy-dom
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { WarpSurface, WarpSurfaceProvider } from './WarpSurface'
const lifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }))
vi.mock('./WarpMaterial', () => ({ WarpMaterial: ({ active }: { active?: boolean }) => { useEffect(() => { lifecycle.mounts++; return () => { lifecycle.unmounts++ } }, []); return <canvas data-active={active} /> } }))
it('moves one mounted renderer between slots and parks it paused when no page needs it', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  const view = (page: string) => <WarpSurfaceProvider><section data-page="a">{page === 'a' && <WarpSurface />}</section><section data-page="b">{page === 'b' && <WarpSurface />}</section></WarpSurfaceProvider>
  try {
    await act(async () => root.render(view('a')))
    const canvas = container.querySelector('canvas')
    expect(container.querySelector('[data-page="a"] canvas')).toBe(canvas)
    await act(async () => root.render(view('b')))
    expect(container.querySelector('[data-page="b"] canvas')).toBe(canvas)
    expect(lifecycle.mounts).toBe(1); expect(lifecycle.unmounts).toBe(0)
    await act(async () => root.render(view('none')))
    expect(canvas?.getAttribute('data-active')).toBe('false')
  } finally { await act(async () => root.unmount()); container.remove() }
  expect(lifecycle.unmounts).toBe(1)
})
