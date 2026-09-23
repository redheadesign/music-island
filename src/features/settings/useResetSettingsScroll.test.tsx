/** @vitest-environment happy-dom */

import { act, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { useResetSettingsScrollOnChange } from './useResetSettingsScroll'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Fixture() {
  const [page, setPage] = useState('island:appearance')
  const panel = useRef<HTMLElement>(null)
  useResetSettingsScrollOnChange(page, panel)
  return <section ref={panel} data-page={page}>
    <button type="button" onClick={() => setPage('island:appearance')}>Appearance</button>
    <button type="button" onClick={() => setPage('island:about')}>About</button>
    <button type="button" onClick={() => setPage('voice:about')}>Voice</button>
    <div data-settings-scroll />
  </section>
}

describe('useResetSettingsScrollOnChange', () => {
  it('preserves the initial position and resets a deep scroll before the next page paints', async () => {
    const scrollContainer = document.createElement('div')
    scrollContainer.className = 'settings-scroll'
    document.body.append(scrollContainer)
    const root = createRoot(scrollContainer)


    try {
      await act(async () => root.render(<Fixture />))
      const content = scrollContainer.querySelector<HTMLElement>('[data-settings-scroll]')!
      expect(content.scrollTop).toBe(0)

      content.scrollTop = 720
      await act(async () => scrollContainer.querySelector<HTMLButtonElement>('button')!.click())
      expect(content.scrollTop).toBe(720)

      await act(async () => scrollContainer.querySelectorAll<HTMLButtonElement>('button')[1].click())
      expect(content.scrollTop).toBe(0)
      expect(scrollContainer.querySelector('section')?.dataset.page).toBe('island:about')

      content.scrollTop = 560
      await act(async () => scrollContainer.querySelectorAll<HTMLButtonElement>('button')[2].click())
      expect(content.scrollTop).toBe(0)
      expect(scrollContainer.querySelector('section')?.dataset.page).toBe('voice:about')
    } finally {
      await act(async () => root.unmount())
      scrollContainer.remove()
    }
  })
})
