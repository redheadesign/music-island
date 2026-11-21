// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { DictationController } from '../../app/useIslandApp'
import { DictationPreview } from './DictationPreview'
import { defaultDictationAppearance, type DictationAppearance } from '../../shared/lib/dictationAppearance'
import type { AppConfig } from '../../shared/lib/types'

vi.mock('framer-motion', async importOriginal => ({ ...await importOriginal<typeof import('framer-motion')>(), useReducedMotion: () => false }))
vi.mock('../../shared/ui/WarpSurface', () => ({ WarpSurface: () => null }))
vi.mock('../../shared/ui/IslandGlassOptic', () => ({ IslandGlassOptic: () => null }))

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

it('restarts the animation with the selected theme and color, then cancels work when inactive', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(42)
  const cancelFrame = vi.spyOn(globalThis, 'cancelAnimationFrame')
  const container = document.createElement('div'), root = createRoot(container)
  const controller = { enabled: true, busy: null } as DictationController
  const render = (theme: 'classic' | 'pixels' | 'wave', palette: DictationAppearance['palette'] = 'accent', active = true) => <DictationPreview controller={controller} locale="ru" active={active} reducedMotion={false} appearance={{ ...defaultDictationAppearance, theme, palette }} onEnable={async () => {}} />
  try {
    await act(async () => root.render(render('classic')))
    await act(async () => vi.advanceTimersByTime(4200))
    expect(container.querySelector('.dictation-preview__scene')?.getAttribute('data-phase')).toBe('transcribing')
    await act(async () => root.render(render('pixels')))
    expect(container.querySelector('.dictation-preview__scene')?.getAttribute('data-phase')).toBe('recording')
    expect(container.querySelector('[data-character="fox"]')).not.toBeNull()
    await act(async () => vi.advanceTimersByTime(4200))
    await act(async () => root.render(render('pixels', 'ember')))
    expect(container.querySelector('.dictation-preview__scene')?.getAttribute('data-phase')).toBe('recording')
    expect(container.querySelector('.dictation-pixel-ears')).not.toBeNull()
    await act(async () => root.render(render('wave')))
    expect(container.querySelector('.dictation-visual--wave')).not.toBeNull()
    await act(async () => root.render(render('wave', 'accent', false)))
    expect(vi.getTimerCount()).toBe(0)
    expect(cancelFrame).toHaveBeenCalledWith(42)
    const calls = raf.mock.calls.length
    await act(async () => vi.advanceTimersByTime(20000))
    expect(raf.mock.calls.length).toBe(calls)
  } finally { await act(async () => root.unmount()); raf.mockRestore(); cancelFrame.mockRestore(); vi.useRealTimers() }
})

it('keeps the material and artwork mounted through phases, repeated recordings and color changes', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(42)
  const container = document.createElement('div'), root = createRoot(container)
  const controller = { enabled: true, busy: null } as DictationController
  const render = (palette: DictationAppearance['palette'] = 'ember') => <DictationPreview controller={controller} locale="ru" active reducedMotion={false} appearance={{ ...defaultDictationAppearance, theme: 'pixels', palette }} onEnable={async () => {}} />
  try {
    await act(async () => root.render(render()))
    const material = container.querySelector('.dictation-cloud-surface')
    const artwork = container.querySelector('[data-character="fox"]')
    expect(material).not.toBeNull()
    for (const duration of [4200, 1600, 1800]) {
      await act(async () => vi.advanceTimersByTime(duration))
      expect(container.querySelector('.dictation-cloud-surface')).toBe(material)
      expect(container.querySelector('[data-character="fox"]')).toBe(artwork)
    }
    await act(async () => vi.advanceTimersByTime(4200))
    await act(async () => root.render(render('prism')))
    expect(container.querySelector('.dictation-preview__scene')?.getAttribute('data-phase')).toBe('recording')
    expect(container.querySelector('.dictation-cloud-surface')).toBe(material)
    expect(container.querySelector('[data-character="fox"]')).toBe(artwork)
  } finally { await act(async () => root.unmount()); raf.mockRestore(); container.remove(); vi.useRealTimers() }
})

it('keeps the running recorder and phase when pinning, adjusting brightness and scrolling back', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  const observe = vi.fn(), disconnect = vi.fn()
  let notify!: (entries: Partial<IntersectionObserverEntry>[]) => void
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof notify) { notify = callback }
    observe = observe
    disconnect = disconnect
  })
  const container = document.createElement('div'), root = createRoot(container)
  container.setAttribute('data-settings-scroll', '')
  const controller = { enabled: true, busy: null } as DictationController
  const render = (foxBrightness: number) => <DictationPreview controller={controller} locale="ru" active reducedMotion={false}
    appearance={{ ...defaultDictationAppearance, shaderTuning: { foxBrightness } }} onEnable={async () => {}} />
  try {
    await act(async () => root.render(render(80)))
    const scene = container.querySelector('.dictation-preview__scene')
    const canvas = container.querySelector('.dictation-cloud-surface')
    const fox = container.querySelector<SVGElement>('[data-character="fox"]')!
    expect(observe).toHaveBeenCalledWith(container.querySelector('.dictation-preview__anchor'))
    await act(async () => vi.advanceTimersByTime(4200))
    await act(async () => notify([{ isIntersecting: false, boundingClientRect: new DOMRect(0, -4, 1, 1) }]))
    expect(container.querySelector('.dictation-preview__dock')?.hasAttribute('data-pinned')).toBe(true)
    await act(async () => root.render(render(30)))
    expect(scene?.getAttribute('data-phase')).toBe('transcribing')
    expect(container.querySelector('[data-character="fox"]')).toBe(fox)
    expect(Number(fox.style.getPropertyValue('--dictation-brightness'))).toBeCloseTo(.58)
    await act(async () => notify([{ isIntersecting: true }]))
    expect(container.querySelector('.dictation-preview__dock')?.hasAttribute('data-pinned')).toBe(false)
    expect(container.querySelector('.dictation-cloud-surface')).toBe(canvas)
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
    vi.useRealTimers()
  }
  expect(disconnect).toHaveBeenCalledOnce()
})

it('updates the material from settings without restarting the preview phase', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  const container = document.createElement('div'), root = createRoot(container)
  const controller = { enabled: true, busy: null } as DictationController
  const render = (interfaceTheme: 'classic' | 'glass') => <DictationPreview
    controller={controller} locale="ru" active reducedMotion={false} onEnable={async () => {}}
    config={{ appearance: { accentColor: '#f76100' }, plugins: { settings: { ui: { interfaceTheme, interfacePalette: 'ocean' } } } } as unknown as AppConfig}
    appearance={{ ...defaultDictationAppearance, theme: 'pixels', palette: 'white' }}
  />
  try {
    await act(async () => root.render(render('classic')))
    await act(async () => vi.advanceTimersByTime(4200))
    const scene = container.querySelector('.dictation-preview__scene')
    const canvas = container.querySelector('.dictation-cloud-surface')
    expect(scene?.getAttribute('data-phase')).toBe('transcribing')
    await act(async () => root.render(render('glass')))
    expect(scene?.getAttribute('data-phase')).toBe('transcribing')
    expect(container.querySelector('.dictation-cloud-surface')).toBe(canvas)
    expect(container.querySelector('.dictation-overlay')?.getAttribute('data-interface-theme')).toBe('glass')
    expect(container.querySelector('.dictation-overlay')?.getAttribute('data-theme')).toBe('pixels')
  } finally { await act(async () => root.unmount()); vi.useRealTimers() }
})
