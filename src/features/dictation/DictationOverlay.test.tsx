// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { DictationOverlayView } from './DictationOverlay'
import { defaultDictationAppearance } from '../../shared/lib/dictationAppearance'

vi.mock('framer-motion', () => ({ useReducedMotion: () => false }))
vi.mock('./DictationCloudSurface', () => ({ DictationCloudSurface: () => <canvas /> }))
vi.mock('./DictationVisual', () => ({ DictationVisual: () => <svg /> }))

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
