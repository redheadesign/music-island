/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useSystemVolume } from '../../app/useIslandApp'
import { IslandSystemVolume } from './IslandSystemVolume'

vi.mock('../../app/useIslandApp', () => ({ useSystemVolume: vi.fn() }))
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

it('releases the previous slider when Windows switches output during a gesture', async () => {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const first = { endpointId: 'speaker', volume: 43, muted: false, available: true, setVolume: vi.fn(), toggleMute: vi.fn() }
  const next = { ...first, endpointId: 'headphones', volume: 72, setVolume: vi.fn() }
  try {
    vi.mocked(useSystemVolume).mockReturnValue(first)
    await act(() => root.render(<IslandSystemVolume locale="en" />))
    await act(() => host.querySelector('button')!.focus())
    const oldSlider = host.querySelector('input')!
    expect(oldSlider.value).toBe('43')
    vi.mocked(useSystemVolume).mockReturnValue(next)
    await act(() => root.render(<IslandSystemVolume locale="en" />))
    expect(oldSlider.isConnected).toBe(false)
    await act(() => { oldSlider.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(next.setVolume).not.toHaveBeenCalled()
    await act(() => host.querySelector('button')!.focus())
    expect(host.querySelector('input')?.value).toBe('72')
  } finally {
    await act(() => root.unmount())
    host.remove()
  }
})
