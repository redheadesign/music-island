import { useEffect, useRef, useState } from 'react'
import type { DictationController } from './useDictationController'

// Serialize native changes so switching fields cannot restore shortcuts over the next capture.
let nativeQueue: Promise<unknown> = Promise.resolve()
let cancelActive: (() => void) | null = null
function nativeAction(action: () => Promise<unknown>) {
  const next = nativeQueue.then(action, action)
  nativeQueue = next.catch(() => {})
  return next
}
const modifiers: Record<string, string> = { Control: 'ctrl', Shift: 'shift', Alt: 'alt', Meta: 'super' }
const keyNames: Record<string, string> = { Space: 'space', Escape: 'escape', Enter: 'enter', Tab: 'tab', Backspace: 'backspace', Delete: 'delete', Insert: 'insert', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`', Comma: ',', Period: '.', Slash: '/', CapsLock: 'capslock', NumLock: 'numlock', ScrollLock: 'scrolllock', Pause: 'pause', PrintScreen: 'printscreen' }
function keyName(code: string, handy: boolean) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code.toLowerCase()
  if (/^Numpad[0-9]$/.test(code)) return (handy ? 'keypad' : 'num') + code.slice(6)
  const numpad: Record<string, string> = handy ? { NumpadAdd: 'keypadplus', NumpadSubtract: 'keypadminus', NumpadMultiply: 'keypadmultiply', NumpadDivide: 'keypaddivide', NumpadDecimal: 'keypaddecimal', NumpadEnter: 'keypadenter' } : { NumpadAdd: 'numadd', NumpadSubtract: 'numsubtract', NumpadMultiply: 'nummultiply', NumpadDivide: 'numdivide', NumpadDecimal: 'numdecimal', NumpadEnter: 'numenter' }
  return numpad[code] ?? keyNames[code] ?? null
}

export function useDictationShortcut(controller: DictationController, id: string) {
  const [recording, setRecording] = useState(false)
  const [keys, setKeys] = useState('')
  const [error, setError] = useState<string | null>(null)
  const session = useRef<{ cancel: () => void } | null>(null)
  const mounted = useRef(true)
  const { api } = controller
  const cancel = () => session.current?.cancel()
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; session.current?.cancel() } }, [api])
  const start = async () => {
    if (session.current) return
    cancelActive?.()
    let active = true, ready = false, keyed = '', keyedCode = '', modifierBinding = ''
    const held = new Map<string, string>()
    const handy = controller.data?.settings.keyboard_implementation !== 'tauri'
    setError(null); setKeys(''); setRecording(true)
    const report = (reason: unknown) => { if (mounted.current) setError(String(reason)) }
    const finish = (binding?: string) => {
      if (!active) return
      active = false
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', abort)
      if (cancelActive === abort) cancelActive = null
      void nativeAction(async () => {
        try {
          if (binding) await controller.run('binding:' + id, async () => {
            const result = await api.changeBinding(id, binding)
            if (!result.success) throw new Error(result.error ?? 'Shortcut could not be registered')
          })
        } catch (reason) { report(reason) }
        finally {
          await api.resumeAllBindings().catch(report)
          if (session.current === current) { session.current = null; if (mounted.current) setRecording(false) }
        }
      })
    }
    const abort = () => finish()
    const current = { cancel: abort }
    session.current = current
    cancelActive = abort
    const modifierList = (event: KeyboardEvent) => {
      const flags: [string, boolean][] = [['ctrl', event.ctrlKey], ['shift', event.shiftKey], ['alt', event.altKey], ['super', event.metaKey]]
      return flags.flatMap(([name, pressed]) => {
        const known = [...held.values()].filter(value => value === name || value.startsWith(name + '_'))
        return pressed ? (known.length ? [...new Set(known)] : [name]) : []
      })
    }
    const down = (event: KeyboardEvent) => {
      if (!active) return
      event.preventDefault(); event.stopPropagation()
      if (!ready || event.repeat) return
      if (event.code === 'Escape' && id !== 'cancel') { abort(); return }
      const modifier = /^(Control|Shift|Alt|Meta)(Left|Right)$/.exec(event.code)
      if (modifier) {
        held.set(event.code, modifiers[modifier[1]] + (handy ? '_' + modifier[2].toLowerCase() : ''))
        modifierBinding = modifierList(event).join('+')
        setKeys(modifierBinding)
      } else {
        const key = keyName(event.code, handy)
        if (!key) return
        keyedCode = event.code
        keyed = [...modifierList(event), key].join('+')
        setKeys(keyed)
      }
    }
    const up = (event: KeyboardEvent) => {
      if (!active) return
      event.preventDefault(); event.stopPropagation()
      if (!ready) return
      held.delete(event.code)
      if (keyed && event.code === keyedCode) finish(keyed)
      else if (!keyed && modifierBinding && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) finish(modifierBinding)
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', abort)
    try {
      await nativeAction(() => api.suspendAllBindings())
      ready = active
    } catch (reason) { report(reason); abort() }
  }
  return { recording, keys, error, start, cancel }
}
