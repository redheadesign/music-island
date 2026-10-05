// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { CommitInput, DictationField } from './DictationFields'
import { SettingsIconButton } from '../../shared/ui/SettingsControls'

it('labels fields and actions separately; blank numbers never save zero', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container); const save = vi.fn()
  try {
    await act(async () => root.render(<DictationField label="Delay" hint="Milliseconds"><CommitInput type="number" value="200" min={100} max={2000} onSave={save} /><SettingsIconButton label="Test sound">♫</SettingsIconButton></DictationField>))
    const input = container.querySelector('input')!
    expect(document.getElementById(input.getAttribute('aria-labelledby')!)?.textContent).toBe('Delay')
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Test sound')
    expect(container.querySelector('button')?.getAttribute('title')).toBe('Test sound')
    expect(container.querySelector('label')).toBeNull()
    const change = async (value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(async () => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    }
    await change(''); expect(save).not.toHaveBeenCalled(); expect(input.value).toBe('200')
    await change('9999'); expect(save).toHaveBeenLastCalledWith('2000')
    await change('-1'); expect(save).toHaveBeenLastCalledWith('100')
    await change('123.8'); expect(save).toHaveBeenLastCalledWith('124')
  } finally { await act(async () => root.unmount()); container.remove() }
})
