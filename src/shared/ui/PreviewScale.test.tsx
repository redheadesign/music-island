// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { PreviewScale } from './PreviewScale'

it('previews the gesture locally, cancels with Escape and commits only on release', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container); const commit = vi.fn()
  try {
    await act(async () => root.render(<PreviewScale value={100} min={75} max={125} step={5} label="Scale" onCommit={commit}>{value => <span>{value}</span>}</PreviewScale>))
    const handle = container.querySelector<HTMLElement>('[role="slider"]')!
    handle.setPointerCapture = vi.fn(); handle.releasePointerCapture = vi.fn()
    vi.spyOn(container.querySelector('.preview-scale__body')!, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 40 } as DOMRect)
    const pointer = async (type: string, x: number) => act(async () => { handle.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: 0 })) })
    await pointer('pointerdown', 0); await pointer('pointermove', 15)
    expect(handle.getAttribute('aria-valuenow')).toBe('125'); expect(commit).not.toHaveBeenCalled()
    await act(async () => { handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    await pointer('pointerup', 15)
    expect(handle.getAttribute('aria-valuenow')).toBe('100'); expect(commit).not.toHaveBeenCalled()
    await pointer('pointerdown', 0); await pointer('pointermove', -10); await pointer('pointerup', -10)
    expect(commit).toHaveBeenLastCalledWith(85)
    await act(async () => { handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })) })
    expect(commit).toHaveBeenLastCalledWith(125)
    expect(container.querySelector('.preview-dimensions button')).toBeNull()
    await act(async () => handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(commit).toHaveBeenLastCalledWith(100)
    await pointer('pointerdown', 0); await pointer('pointermove', 15); await pointer('pointercancel', 15)
    expect(commit).toHaveBeenCalledTimes(3)
    expect(handle.getAttribute('aria-valuenow')).toBe('100')
  } finally { await act(async () => root.unmount()); container.remove() }
})
