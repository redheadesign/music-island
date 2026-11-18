// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { REDUCED_TRANSPARENCY_QUERY, useSystemReducedTransparency } from './useSystemReducedTransparency'

it('updates Glass as the OS preference changes in either direction', async () => {
  const media = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('matchMedia', vi.fn(() => media))
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.createElement('div')
  const root = createRoot(host)
  function Sample() {
    return <div data-reduced-transparency={useSystemReducedTransparency()} />
  }
  try {
    await act(async () => root.render(<Sample />))
    expect(matchMedia).toHaveBeenCalledWith(REDUCED_TRANSPARENCY_QUERY)
    expect(host.firstElementChild?.getAttribute('data-reduced-transparency')).toBe('false')
    for (const matches of [true, false]) {
      act(() => { media.matches = matches; media.dispatchEvent(new Event('change')) })
      expect(host.firstElementChild?.getAttribute('data-reduced-transparency')).toBe(String(matches))
    }
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
})
