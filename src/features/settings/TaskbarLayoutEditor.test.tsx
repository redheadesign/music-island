/** @vitest-environment happy-dom */

import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { getDefaultConfig } from '../../app/tauriApi'
import type { AppConfig } from '../../shared/lib/types'
import { TaskbarLayoutEditor } from './TaskbarLayoutEditor'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../../shared/ui/WarpMaterial', () => ({
  WarpMaterial: ({ reducedMotion = false }: { reducedMotion?: boolean }) => (
    <div className="warp-material" data-speed={reducedMotion ? 0 : 0.225} />
  ),
}))

function order(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-taskbar-target="controls"] [data-taskbar-element]'))
    .map((node) => node.dataset.taskbarElement!)
}

function item(container: HTMLElement, element: string, target = 'controls'): HTMLElement {
  return container.querySelector<HTMLElement>(`[data-taskbar-target="${target}"] [data-taskbar-element="${element}"]`)!
}

function mockPointerCapture(node: HTMLElement): void {
  Object.defineProperties(node, {
    setPointerCapture: { configurable: true, value: () => undefined },
    releasePointerCapture: { configurable: true, value: () => undefined },
  })
}

async function drag(source: HTMLElement, hit: HTMLElement | null, pointerId: number, x = 1000, cancel = false): Promise<void> {
  mockPointerCapture(source)
  const elementFromPoint = vi.spyOn(document, 'elementFromPoint').mockReturnValue(hit)
  try {
    await act(async () => {
      source.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId, clientX: 0, clientY: 0 }))
      source.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId, clientX: x, clientY: 20 }))
      source.dispatchEvent(new PointerEvent(cancel ? 'pointercancel' : 'pointerup', { bubbles: true, pointerId, clientX: x, clientY: 20 }))
    })
  } finally {
    elementFromPoint.mockRestore()
  }
}

async function press(node: HTMLElement, key: string): Promise<void> {
  await act(async () => node.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key })))
}

async function mountEditor() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const changes = vi.fn()
  function Harness() {
    const [config, setConfig] = useState<AppConfig>(() => getDefaultConfig())
    return <TaskbarLayoutEditor config={config} onChange={(next) => { changes(next); setConfig(next) }} />
  }
  await act(async () => root.render(<Harness />))
  return { container, changes, unmount: async () => { await act(async () => root.unmount()); container.remove() } }
}

describe('TaskbarLayoutEditor', () => {
  it('reorders the actual control row by pointer, including the cover', async () => {
    const mounted = await mountEditor()
    try {
      const controls = mounted.container.querySelector<HTMLElement>('[data-taskbar-target="controls"]')!
      await drag(item(mounted.container, 'cover'), controls, 1)
      expect(order(mounted.container)).toEqual(['previous', 'transport', 'next', 'cover'])
      expect(mounted.changes).toHaveBeenCalledTimes(1)
    } finally { await mounted.unmount() }
  })

  it('adds shuffle and repeat from the catalog and removes previous', async () => {
    const mounted = await mountEditor()
    try {
      const controls = mounted.container.querySelector<HTMLElement>('[data-taskbar-target="controls"]')!
      const catalog = mounted.container.querySelector<HTMLElement>('[data-taskbar-target="catalog"]')!
      await drag(item(mounted.container, 'shuffle', 'catalog'), controls, 2)
      await drag(item(mounted.container, 'repeat', 'catalog'), controls, 3)
      expect(order(mounted.container)).toEqual(['cover', 'previous', 'transport', 'next', 'shuffle', 'repeat'])
      await drag(item(mounted.container, 'previous'), catalog, 4)
      expect(order(mounted.container)).toEqual(['cover', 'transport', 'next', 'shuffle', 'repeat'])
      expect(item(mounted.container, 'previous', 'catalog')).not.toBeNull()
    } finally { await mounted.unmount() }
  })

  it('blocks transport removal while allowing it to be reordered', async () => {
    const mounted = await mountEditor()
    try {
      const controls = mounted.container.querySelector<HTMLElement>('[data-taskbar-target="controls"]')!
      const catalog = mounted.container.querySelector<HTMLElement>('[data-taskbar-target="catalog"]')!
      await drag(item(mounted.container, 'transport'), catalog, 5)
      expect(order(mounted.container)).toEqual(['cover', 'previous', 'transport', 'next'])
      expect(mounted.changes).not.toHaveBeenCalled()
      await drag(item(mounted.container, 'transport'), controls, 6, -10)
      expect(order(mounted.container)).toEqual(['transport', 'cover', 'previous', 'next'])
      expect(mounted.changes).toHaveBeenCalledTimes(1)
    } finally { await mounted.unmount() }
  })

  it('cancels external and pointer-cancel drops, supports Escape, and reorders by keyboard', async () => {
    const mounted = await mountEditor()
    try {
      const initial = ['cover', 'previous', 'transport', 'next']
      await drag(item(mounted.container, 'cover'), null, 7)
      await drag(item(mounted.container, 'cover'), null, 8, 1000, true)
      expect(order(mounted.container)).toEqual(initial)
      expect(mounted.changes).not.toHaveBeenCalled()

      let cover = item(mounted.container, 'cover')
      await press(cover, ' ')
      expect(cover.getAttribute('aria-pressed')).toBe('true')
      await press(cover, 'Escape')
      expect(cover.getAttribute('aria-pressed')).toBe('false')
      expect(order(mounted.container)).toEqual(initial)

      cover = item(mounted.container, 'cover')
      await press(cover, ' ')
      await press(cover, 'ArrowRight')
      await press(cover, 'Enter')
      expect(order(mounted.container)).toEqual(['previous', 'cover', 'transport', 'next'])
    } finally { await mounted.unmount() }
  })
})
