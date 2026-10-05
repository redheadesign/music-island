// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { DictationVolume } from './DictationVolume'

it('waits for the volume to save before playing a test sound', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host)
  let finish!: () => void
  const save = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
  const play = vi.fn(async () => {})
  try {
    await act(async () => root.render(<DictationVolume value={50} locale="ru" busy={false} onSave={save} onTest={play} />))
    const range = host.querySelector<HTMLInputElement>('[type="range"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(range, '24')
      range.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => range.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })))
    await act(async () => host.querySelector('button')!.click())
    expect(save).toHaveBeenLastCalledWith(24); expect(play).not.toHaveBeenCalled()
    expect(host.querySelector('button')?.disabled).toBe(true)
    await act(async () => finish())
    expect(play).toHaveBeenCalledOnce(); expect(host.querySelector('button')?.disabled).toBe(false)
  } finally { await act(async () => root.unmount()); host.remove() }
})
