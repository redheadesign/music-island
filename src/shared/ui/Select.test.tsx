/** @vitest-environment happy-dom */
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ActionMenu, Select } from './Select'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
beforeEach(()=>vi.stubGlobal('ResizeObserver',class { observe() {} disconnect() {} }))
afterEach(()=>vi.unstubAllGlobals())
it('keeps the trigger typography when its menu is portaled outside the page',async()=>{
  const container=document.createElement('div'); document.body.append(container)
  const root=createRoot(container)
  try {
    await act(async()=>root.render(<Select value="usb" options={[{value:'usb',label:'USB'},{value:'built-in',label:'Built-in'}]} onChange={vi.fn()} ariaLabel="Device" />))
    const trigger=container.querySelector<HTMLButtonElement>('button')!
    trigger.style.fontFamily='Portal Test'; trigger.style.fontSize='17px'; trigger.style.fontWeight='500'; trigger.style.lineHeight='26px'
    await act(async()=>trigger.click())
    const menu=document.querySelector<HTMLElement>('[role="listbox"]')!
    expect(container.contains(menu)).toBe(false)
    expect(menu.style.fontFamily).toBe(getComputedStyle(trigger).fontFamily)
    expect(menu.style.fontSize).toBe('17px')
    expect(menu.style.fontWeight).toBe('500')
    expect(menu.style.lineHeight).toBe('26px')
  } finally { await act(async()=>root.unmount()); container.remove() }
})

it('keeps a checkbox menu open for multiple changes and restores focus on Escape', async () => {
  function Filter() {
    const [english, setEnglish] = useState(false)
    const [russian, setRussian] = useState(true)
    return <ActionMenu label="Languages" items={[
      { id: 'en', label: 'English', checked: english, onSelect: () => setEnglish(value => !value) },
      { id: 'ru', label: 'Russian', checked: russian, onSelect: () => setRussian(value => !value) },
    ]} />
  }
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<Filter />))
    const trigger = container.querySelector<HTMLButtonElement>('button')!
    await act(async () => trigger.click())
    const options = () => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]')]
    expect(options().map(option => option.getAttribute('aria-checked'))).toEqual(['false', 'true'])
    await act(async () => options()[0].click())
    expect(options().map(option => option.getAttribute('aria-checked'))).toEqual(['true', 'true'])
    await act(async () => options()[1].click())
    expect(options().map(option => option.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    await act(async () => options()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  } finally { await act(async () => root.unmount()); container.remove() }
})

it('dismisses open options when the control becomes disabled', async () => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const render = (disabled: boolean) => root.render(<Select value="usb" options={[{ value: 'usb', label: 'USB' }]} onChange={vi.fn()} ariaLabel="Device" disabled={disabled} />)
  try {
    await act(async () => render(false))
    const trigger = container.querySelector<HTMLButtonElement>('button')!
    await act(async () => trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })))
    expect(document.querySelector('[role="listbox"]')?.hasAttribute('data-enter')).toBe(true)
    await act(async () => render(true))
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await act(async () => render(false))
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    await act(async () => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })))
    expect(document.querySelector('[role="listbox"]')?.hasAttribute('data-enter')).toBe(false)
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
