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
  </section>
}

describe('useResetSettingsScrollOnChange', () => {
  it('preserves the initial position and resets a deep scroll before the next page paints', async () => {
    const scrollContainer = document.createElement('div')
    scrollContainer.className = 'settings-scroll'
    document.body.append(scrollContainer)
    const root = createRoot(scrollContainer)
    scrollContainer.scrollTop = 480

    try {
      await act(async () => root.render(<Fixture />))
      expect(scrollContainer.scrollTop).toBe(480)

      scrollContainer.scrollTop = 720
      await act(async () => scrollContainer.querySelector<HTMLButtonElement>('button')!.click())
      expect(scrollContainer.scrollTop).toBe(720)

      await act(async () => scrollContainer.querySelectorAll<HTMLButtonElement>('button')[1].click())
      expect(scrollContainer.scrollTop).toBe(0)
      expect(scrollContainer.querySelector('section')?.dataset.page).toBe('island:about')

      scrollContainer.scrollTop = 560
      await act(async () => scrollContainer.querySelectorAll<HTMLButtonElement>('button')[2].click())
      expect(scrollContainer.scrollTop).toBe(0)
      expect(scrollContainer.querySelector('section')?.dataset.page).toBe('voice:about')
    } finally {
      await act(async () => root.unmount())
      scrollContainer.remove()
    }
  })
})
