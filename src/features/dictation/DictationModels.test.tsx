// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { DictationController } from '../../app/useIslandApp'
import type { DictationStatus } from '../../shared/lib/dictationTypes'
import { dictationModels, dictationSettings, gigaamRnnt } from '../../stories/dictationFixtures'
import { DictationModels } from './DictationModels'

it('protects the current recording while leaving downloads and other installed files available', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div')
  const root = createRoot(host)
  const models = [{ ...gigaamRnnt, is_downloaded: true }, ...dictationModels.map((m, i) => ({ ...m, is_downloaded: i === 0 }))]
  const render = async (phase: DictationStatus['phase']) => {
    const controller = { data: { models, status: { phase }, settings: { ...dictationSettings, selected_model: gigaamRnnt.id } },
      api: {}, progress: {}, run: vi.fn() } as unknown as DictationController
    await act(async () => root.render(<DictationModels controller={controller} locale="ru" />))
  }
  const button = (text: string) => Array.from(host.querySelectorAll('button')).find(b => b.textContent === text)!
  const remove = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="Удалить модель ${name}"]`)!
  try {
    for (const phase of ['preparing', 'recording', 'streaming', 'transcribing'] as const) {
      await render(phase)
      expect(button('Использовать').disabled).toBe(true)
      expect(remove(gigaamRnnt.name).disabled).toBe(true)
      expect(remove(models[1].name).disabled).toBe(false)
      expect(button('Скачать').disabled).toBe(false)
    }
    await render('processing')
    expect(button('Использовать').disabled).toBe(false)
    expect(remove(gigaamRnnt.name).disabled).toBe(false)
  } finally {
    await act(async () => root.unmount())
  }
})
