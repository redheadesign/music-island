/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SystemVolumeControl, type VolumeControls } from './SystemVolumeControl'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const unmount of cleanup.splice(0)) await unmount() })

async function mount(audio?: VolumeControls) {
  const host = document.createElement('section')
  host.className = 'music-module'
  document.body.append(host)
  const root = createRoot(host)
  await act(() => root.render(<SystemVolumeControl locale="en" audio={audio} />))
  cleanup.push(async () => { await act(() => root.unmount()); host.remove() })
  return { host, button: host.querySelector('button')!, slider: () => host.querySelector('input') }
}

const available = () => ({ available: true, volume: 62, muted: false, setVolume: vi.fn(), toggleMute: vi.fn() })
const key = (target: EventTarget, value: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }))

describe('system speaker', () => {
  it('keeps the drag sample inert and disables controls for a missing output', async () => {
    const sample = await mount()
    await act(() => sample.button.focus())
    expect(sample.slider()).toBeNull()
    expect(sample.button.tabIndex).toBe(-1)
    const audio = { ...available(), available: false }
    const missing = await mount(audio)
    expect(missing.button.disabled).toBe(true)
    await act(() => missing.button.click())
    expect(audio.toggleMute).not.toHaveBeenCalled()
  })

  it('toggles mute separately, restores focus on Escape, and reopens with the keyboard', async () => {
    const audio = available()
    const { button, slider } = await mount(audio)
    await act(() => button.focus())
    expect(slider()?.value).toBe('62')
    await act(() => button.click())
    expect(audio.toggleMute).toHaveBeenCalledOnce()
    expect(audio.setVolume).not.toHaveBeenCalled()
    await act(() => slider()?.focus())
    await act(() => { key(slider()!, 'Escape') })
    expect(slider()).toBeNull()
    expect(document.activeElement).toBe(button)
    await act(() => { key(button, 'ArrowDown') })
    expect(document.activeElement).toBe(slider())
  })

  it('opens toward free space inside a scaled island and dismisses hover without focus', async () => {
    const { button, host, slider } = await mount(available())
    const group = button.parentElement!
    const bounds = (x: number, width: number) => new DOMRect(x, 0, width, 32)
    host.getBoundingClientRect = () => bounds(20, 250)
    group.getBoundingClientRect = () => bounds(125, 24)
    Object.defineProperty(group, 'offsetWidth', { value: 32 })
    await act(() => { group.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })) })
    expect(slider()?.parentElement?.dataset.side).toBe('right')
    expect(slider()?.parentElement?.style.width).toBe('128px')
    await act(() => { key(document.body, 'Escape') })
    expect(slider()).toBeNull()
    group.getBoundingClientRect = () => bounds(221, 24)
    await act(() => button.focus())
    expect(slider()?.parentElement?.dataset.side).toBe('left')
  })
})
