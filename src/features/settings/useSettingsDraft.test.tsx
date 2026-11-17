// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { getDefaultConfig } from '../../app/tauriApi'
import type { AppConfig } from '../../shared/lib/types'
import { useSettingsDraft } from './useSettingsDraft'

const initial = getDefaultConfig()
function withDelay(ms: number) { return { ...initial, behavior: { ...initial.behavior, hoverDelayMs: ms } } }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('keeps newer edits across old acknowledgements and retries the last failed write', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  const root = createRoot(document.createElement('div'))
  let finish!: () => void
  const save = vi.fn<(next: AppConfig, base?: AppConfig) => Promise<void>>()
    .mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    .mockRejectedValueOnce(new Error('Disk full'))
    .mockResolvedValue(undefined)
  let editor!: ReturnType<typeof useSettingsDraft>
  const Probe = ({ config }: { config: AppConfig }) => { editor = useSettingsDraft(config, save); return null }
  const first = withDelay(300), last = withDelay(900)
  try {
    await act(async () => root.render(<Probe config={initial} />))
    await act(async () => { editor.previewAndSave(first); await vi.advanceTimersByTimeAsync(280) })
    await act(async () => { editor.previewAndSave(last); await vi.advanceTimersByTimeAsync(280) })
    expect(save).toHaveBeenCalledTimes(1)
    await act(async () => { root.render(<Probe config={first} />); finish() })
    expect(editor.draft.behavior.hoverDelayMs).toBe(900)
    expect(editor.saveFailed).toBe(true)
    expect(save).toHaveBeenNthCalledWith(2, last, first)
    await act(async () => { editor.retry() })
    expect(save).toHaveBeenNthCalledWith(3, last, first)
    expect(editor.saveFailed).toBe(false)
  } finally { await act(async () => root.unmount()) }
})

it('applies a delayed plugin change to the most recent draft', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers()
  const root = createRoot(document.createElement('div'))
  const save = vi.fn().mockResolvedValue(undefined)
  let editor!: ReturnType<typeof useSettingsDraft>
  const Probe = () => { editor = useSettingsDraft(initial, save); return null }
  try {
    await act(async () => root.render(<Probe />))
    const updateAfterEnable = editor.previewAndSave
    await act(async () => editor.previewAndSave(withDelay(760)))
    await act(async () => {
      updateAfterEnable(current => ({
        ...current,
        plugins: { ...current.plugins, enabled: [...new Set([...current.plugins.enabled, 'dictation'])] },
      }))
      await vi.advanceTimersByTimeAsync(280)
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      behavior: expect.objectContaining({ hoverDelayMs: 760 }),
      plugins: expect.objectContaining({ enabled: expect.arrayContaining(['dictation']) }),
    }), initial)
  } finally { await act(async () => root.unmount()) }
})
