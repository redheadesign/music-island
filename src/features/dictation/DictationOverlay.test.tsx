// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { DictationOverlayView } from './DictationOverlay'
import { defaultDictationAppearance } from '../../shared/lib/dictationAppearance'
import { buildInterfacePaletteStyle } from '../../shared/lib/interfacePalette'

const native = vi.hoisted(() => ({ status: undefined as 'active' | 'unavailable' | undefined }))
vi.mock('../../app/useIslandApp', () => ({ useDictationOverlay: vi.fn(), useNativeBackdrop: () => native.status }))
vi.mock('framer-motion', () => ({ useReducedMotion: () => false }))
vi.mock('./DictationCloudSurface', () => ({ DictationCloudSurface: () => <canvas /> }))
vi.mock('./DictationVisual', () => ({ DictationVisual: () => <svg /> }))
vi.mock('../../shared/ui/IslandGlassOptic', () => ({ IslandGlassOptic: ({ active }: { active: boolean }) => <span className="island-glass-optic" hidden={!active} /> }))

it('uses release to finish in hold mode, and one finish action in toggle modes for every theme', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div'), root = createRoot(container)
  const finish = vi.fn(async () => {}), cancel = vi.fn(async () => {})
  try {
    for (const theme of ['classic', 'wave', 'pixels'] as const) {
      for (const phase of ['recording', 'streaming'] as const) {
        for (const shortcutActivation of ['push_to_talk', 'toggle', 'hold_or_toggle'] as const) {
          const status = { revision: 1, operationId: 1, phase, ready: true, text: '', error: null, shortcutActivation }
          await act(async () => root.render(<DictationOverlayView visible reducedMotion status={status} appearance={{ ...defaultDictationAppearance, theme }} levels={[]} text={{ committed: '', tentative: '' }} finish={finish} cancel={cancel} copy={async () => {}} />))
          const actions = container.querySelectorAll('button')
          expect(actions.length, `${theme}/${phase}/${shortcutActivation}`).toBe(shortcutActivation === 'push_to_talk' ? 0 : 1)
          if (actions.length) {
            expect(actions[0].getAttribute('aria-label')).toBe('Завершить запись')
            await act(async () => actions[0].click())
          }
        }
      }
    }
    expect(finish).toHaveBeenCalledTimes(12)
    expect(cancel).not.toHaveBeenCalled()
    const status = { revision: 2, operationId: 1, phase: 'error' as const, ready: true, text: 'Сохраните этот текст', error: 'Target closed', shortcutActivation: 'push_to_talk' as const }
    await act(async () => root.render(<DictationOverlayView visible reducedMotion status={status} appearance={{ ...defaultDictationAppearance, theme: 'wave' }} levels={[]} text={{ committed: '', tentative: '' }} finish={finish} cancel={cancel} copy={async () => {}} />))
    expect(container.querySelector('[aria-label="Скопировать текст"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Закрыть"]')).not.toBeNull()
  } finally { await act(async () => root.unmount()) }
})

it('shows slow model loading after two seconds without flashing fast loads or changing a later operation', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers()
  const container = document.createElement('div'), root = createRoot(container)
  const render = (modelLoading: boolean, operationId = 1, phase = 'streaming') => <DictationOverlayView visible reducedMotion status={{ revision: 1, operationId, phase, ready: true, text: '', error: null, modelLoading, shortcutActivation: 'push_to_talk' }} appearance={{ ...defaultDictationAppearance, theme: 'wave' }} levels={[]} text={{ committed: '', tentative: '' }} cancel={async () => {}} copy={async () => {}} />
  try {
    await act(async () => root.render(render(true)))
    await act(async () => vi.advanceTimersByTime(1500))
    expect(container.querySelector('.dictation-overlay__text')).toBeNull()
    await act(async () => root.render(render(false)))
    await act(async () => vi.advanceTimersByTime(3000))
    expect(container.querySelector('.dictation-overlay__text')).toBeNull()
    await act(async () => root.render(render(true)))
    await act(async () => vi.advanceTimersByTime(2000))
    expect(container.querySelector('.dictation-overlay__text')?.textContent).toBe('Загружаю модель…')
    await act(async () => root.render(render(false)))
    expect(container.querySelector('.dictation-overlay__text')).not.toBeNull()
    expect(container.querySelector('.dictation-overlay__text')?.textContent).toBe('')
    await act(async () => root.render(render(true, 2)))
    expect(container.querySelector('.dictation-overlay__text')).toBeNull()
    await act(async () => root.render(render(true, 2, 'transcribing')))
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Загружаю модель…')
    expect(vi.getTimerCount()).toBe(0)
  } finally { await act(async () => root.unmount()); vi.useRealTimers() }
})

it('shows measured audio time only while transcribing and offers cancellation in every recorder', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div'), root = createRoot(container)
  const cancel = vi.fn(async () => {})
  const render = (theme: 'wave' | 'pixels' | 'classic', phase: string, completedAudioMs = 67000) => (
    <DictationOverlayView visible active reducedMotion levels={[]} text={{ committed: '', tentative: '' }}
      appearance={{ ...defaultDictationAppearance, theme }} cancel={cancel} copy={async () => {}}
      status={{ phase, revision: 4, operationId: 5, text: '', ready: true, error: null, progress: { completedAudioMs, totalAudioMs: 191000 } }} />
  )
  try {
    for (const theme of ['wave', 'pixels', 'classic'] as const) {
      await act(async () => root.render(render(theme, 'transcribing')))
      const live = container.querySelector('[role="status"]')!
      const timer = container.querySelector('[role="progressbar"]')!
      expect(live.textContent).toBe('Распознаю…')
      expect(live.contains(timer)).toBe(false)
      expect(timer.getAttribute('aria-label')).toBe('Распознано аудио')
      expect(timer.getAttribute('aria-valuemax')).toBe('191')
      expect(timer.getAttribute('aria-valuenow')).toBe('67')
      expect(timer.getAttribute('aria-valuetext')).toBe('1:07 из 3:11')
      await act(async () => root.render(render(theme, 'transcribing', 197000)))
      expect(container.querySelector('[role="status"]')).toBe(live)
      expect(live.textContent).toBe('Распознаю…')
      expect(timer.getAttribute('aria-valuenow')).toBe('191')
      await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Отменить обработку"]')!.click())
      await act(async () => root.render(render(theme, 'completed')))
      expect(container.querySelector('[role="progressbar"]')).toBeNull()
    }
    expect(cancel).toHaveBeenCalledTimes(3)
  } finally { await act(async () => root.unmount()) }
})

it('reports copy failure on the current Fox error and clears it for a new recording', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div'), root = createRoot(container)
  const copy = vi.fn(async () => { throw new Error('Clipboard unavailable') })
  const cancel = vi.fn(async () => {})
  const render = (operationId: number, phase: 'error' | 'completed' = 'error') => (
    <DictationOverlayView visible reducedMotion appearance={defaultDictationAppearance}
      status={{ revision: 2, operationId, phase, ready: true, text: 'Тестовая запись.', error: phase === 'error' ? 'Target closed' : null }}
      levels={[]} text={{ committed: '', tentative: '' }} copy={copy} cancel={cancel} />
  )
  try {
    await act(async () => root.render(render(1)))
    const alert = () => container.querySelector('[role="alert"]')
    expect(alert()?.textContent).toBe('Не удалось вставить')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Скопировать текст"]')?.click())
    expect(alert()?.textContent).toBe('Не удалось скопировать')
    await act(async () => root.render(render(1, 'completed')))
    expect(alert()).toBeNull()
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Готово')
    await act(async () => root.render(render(2)))
    expect(alert()?.textContent).toBe('Не удалось вставить')
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Закрыть"]')?.click())
    expect(cancel).toHaveBeenCalledOnce()
  } finally { await act(async () => root.unmount()) }
})

it('switches material and colors in every recorder state while keeping its renderer and controls', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div'), root = createRoot(container)
  const finish = vi.fn(async () => {}), cancel = vi.fn(async () => {})
  try {
    for (const theme of ['classic', 'wave', 'pixels'] as const) {
      for (const phase of ['preparing', 'recording', 'streaming', 'transcribing', 'processing', 'completed', 'cancelled', 'error'] as const) {
        const status = { revision: 2, operationId: 12, phase, ready: true, text: 'Слова.', error: phase === 'error' ? 'Target closed' : null }
        const render = (interfaceTheme: 'classic' | 'glass') => <DictationOverlayView visible reducedMotion
          status={status} appearance={{ ...defaultDictationAppearance, theme, palette: 'white' }} interfaceTheme={interfaceTheme}
          interfacePalette="ocean" paletteStyle={buildInterfacePaletteStyle('ocean', '#f76100')}
          levels={[.3]} text={{ committed: '', tentative: '' }} finish={finish} cancel={cancel} copy={async () => {}} />
        await act(async () => root.render(render('classic')))
        const overlay = container.querySelector('.dictation-overlay')
        const artwork = container.querySelector('canvas, svg')
        const controls = [...container.querySelectorAll('button')]
        await act(async () => root.render(render('glass')))
        expect(container.querySelector('.dictation-overlay'), theme + '/' + phase).toBe(overlay)
        expect(overlay?.getAttribute('data-material')).toBe('glass')
        expect(overlay?.getAttribute('data-theme')).toBe(theme)
        expect(container.querySelector('canvas, svg')).toBe(artwork)
        expect([...container.querySelectorAll('button')]).toEqual(controls)
        expect((overlay as HTMLElement).style.getPropertyValue('--accent')).toBe('#70b9ee')
        expect(container.querySelector('.island-glass-optic:not([hidden])')).not.toBeNull()
      }
    }
    expect(finish).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
  } finally { await act(async () => root.unmount()) }
})

it('keeps readable artwork and controls when native glass is unavailable', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div'), root = createRoot(container)
  native.status = 'unavailable'
  const finish = vi.fn(async () => {})
  try {
    await act(async () => root.render(<DictationOverlayView visible reducedMotion interfaceTheme="glass"
      appearance={{ ...defaultDictationAppearance, theme: 'wave' }}
      status={{ revision: 3, operationId: 7, phase: 'recording', ready: true, text: '', error: null }}
      levels={[.8]} text={{ committed: '', tentative: '' }} finish={finish} cancel={async () => {}} copy={async () => {}} />))
    expect(container.querySelector('.dictation-overlay')?.getAttribute('data-native-backdrop')).toBe('unavailable')
    expect(container.querySelectorAll('.island-glass-optic:not([hidden])')).toHaveLength(0)
    expect(container.querySelectorAll('[data-native-backdrop-surface]')).toHaveLength(2)
    expect(container.querySelectorAll('.dictation-wave-fallback i')).toHaveLength(8)
    const stop = container.querySelector<HTMLButtonElement>('[aria-label="Завершить запись"]')!
    expect(stop.disabled).toBe(false)
    await act(async () => stop.click())
    expect(finish).toHaveBeenCalledOnce()
  } finally { native.status = undefined; await act(async () => root.unmount()) }
})

it('fits the optical edge after a capsule resize while its artwork and recording keep running', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div'), root = createRoot(container)
  const finish = vi.fn(async () => {}), cancel = vi.fn(async () => {})
  try {
    await act(async () => root.render(<DictationOverlayView visible reducedMotion interfaceTheme="glass"
      appearance={{ ...defaultDictationAppearance, theme: 'wave' }}
      status={{ revision: 3, operationId: 7, phase: 'recording', ready: true, text: '', error: null }}
      levels={[.8]} text={{ committed: '', tentative: '' }} finish={finish} cancel={cancel} copy={async () => {}} />))
    const overlay = container.querySelector('.dictation-overlay')!
    const canvas = container.querySelector('canvas')
    const transition = async (type: string, propertyName: string) => {
      const event = new Event(type, { bubbles: true })
      Object.defineProperty(event, 'propertyName', { value: propertyName })
      await act(async () => overlay.dispatchEvent(event))
    }
    await transition('transitionrun', 'width')
    await transition('transitionrun', 'height')
    expect(container.querySelectorAll('.island-glass-optic:not([hidden])')).toHaveLength(0)
    await transition('transitionend', 'width')
    expect(container.querySelectorAll('.island-glass-optic:not([hidden])')).toHaveLength(0)
    await transition('transitioncancel', 'height')
    expect(container.querySelector('.island-glass-optic:not([hidden])')).not.toBeNull()
    expect(container.querySelector('canvas')).toBe(canvas)
    expect(overlay.getAttribute('data-phase')).toBe('recording')
    expect(finish).not.toHaveBeenCalled()
    expect(cancel).not.toHaveBeenCalled()
  } finally { await act(async () => root.unmount()) }
})
