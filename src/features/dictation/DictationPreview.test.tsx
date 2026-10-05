// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { DictationController } from '../../app/useIslandApp'
import { DictationPreview } from './DictationPreview'

vi.mock('framer-motion', () => ({ useReducedMotion: () => false }))
vi.mock('../../shared/ui/WarpSurface', () => ({ WarpSurface: () => null }))

it('cycles a compact preview without changing saved style, and stops with reduced motion', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  const controller = { enabled: true, busy: null, data: { settings: { overlay_style: 'live' } } } as DictationController
  const render = (reducedMotion = false) => <DictationPreview controller={controller} locale="ru" active reducedMotion={reducedMotion} onEnable={async () => {}} />
  const phase = () => container.querySelector('.dictation-preview__scene')?.getAttribute('data-phase')
  try {
    await act(async () => root.render(render()))
    expect(phase()).toBe('recording')
    expect(container.querySelector('.dictation-overlay__text')).toBeNull()
    expect(container.querySelector('[aria-label="Вид плашки"]')).toBeNull()
    await act(async () => vi.advanceTimersByTime(4200))
    expect(phase()).toBe('transcribing')
    await act(async () => vi.advanceTimersByTime(1600))
    expect(phase()).toBe('completed')
    await act(async () => vi.advanceTimersByTime(1800))
    expect(phase()).toBe('recording')
    await act(async () => root.render(render(true)))
    await act(async () => vi.advanceTimersByTime(20000))
    expect(phase()).toBe('recording')
    expect(vi.getTimerCount()).toBe(0)
    expect(controller.data?.settings.overlay_style).toBe('live')
    expect(container.querySelector('.stateful-warp-surface')?.getAttribute('data-running')).toBe('true')
    await act(async () => root.render(<DictationPreview controller={{ ...controller, enabled: false }} locale="ru" active reducedMotion onEnable={async () => {}} />))
    expect(container.querySelector('.stateful-warp-surface')?.getAttribute('data-running')).toBe('false')
  } finally { await act(async () => root.unmount()); container.remove(); vi.useRealTimers() }
})
