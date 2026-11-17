// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { useDictionaryDraft } from './useDictionaryDraft'

it('keeps edited lines after a failed save and retries the same list', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const root = createRoot(document.createElement('div'))
  const write = vi.fn<(words: string[]) => Promise<unknown>>()
    .mockRejectedValueOnce(new Error('Disk busy')).mockResolvedValue(undefined)
  let field!: ReturnType<typeof useDictionaryDraft>
  function Probe({ words }: { words: string[] }) { field = useDictionaryDraft(words, write); return null }
  try {
    await act(async () => root.render(<Probe words={['исходное']} />))
    await act(async () => field.edit('новое\n\n слово '))
    await act(async () => field.save())
    expect(field.failed).toBe(true)
    expect(field.value).toBe('новое\n\n слово ')
    await act(async () => root.render(<Probe words={['обновление']} />))
    expect(field.value).toBe('новое\n\n слово ')
    await act(async () => field.save())
    expect(write.mock.calls).toEqual([[['новое', 'слово']], [['новое', 'слово']]])
    expect(field.failed).toBe(false)
  } finally { await act(async () => root.unmount()) }
})

