// Key-release rules adapted from Handy 0.9.7 HandyKeysShortcutInput (MIT).
import { useEffect, useRef, useState } from 'react'
import { listenDictationEvent } from './dictationEvents'
import type { DictationController } from './useDictationController'

interface KeyEvent { modifiers: string[]; key: string | null; is_key_down: boolean; hotkey_string: string }
export function useDictationShortcut(controller: DictationController, id: string) {
  const [recording, setRecording] = useState(false)
  const [keys, setKeys] = useState('')
  const [error, setError] = useState<string | null>(null)
  const session = useRef<{ stop: () => void; active: boolean } | null>(null)
  const { api } = controller
  const cancel = () => {
    const current = session.current
    if (!current) return
    current.active = false
    current.stop()
    session.current = null
    setRecording(false)
    void api.stopHandyKeysRecording().catch((reason) => setError(String(reason)))
  }
  useEffect(() => () => {
    const current = session.current
    if (current) {
      current.active = false
      current.stop()
      session.current = null
      void api.stopHandyKeysRecording().catch(() => {})
    }
  }, [api])
  const start = async () => {
    if (session.current) return
    const current = { active: true, stop: () => {} }
    session.current = current
    setError(null); setKeys(''); setRecording(true)
    let keyed = '', modifiersOnly = ''
    const finish = async (binding: string) => {
      if (!current.active) return
      current.active = false
      current.stop()
      try {
        await controller.run(`binding:${id}`, async () => {
          const result = await api.changeBinding(id, binding)
          if (!result.success) throw new Error(result.error ?? 'Shortcut could not be registered')
        })
      } catch (reason) { setError(String(reason)) }
      finally {
        await api.stopHandyKeysRecording().catch((reason) => setError(String(reason)))
        if (session.current === current) { session.current = null; setRecording(false) }
      }
    }
    try {
      current.stop = await listenDictationEvent<KeyEvent>('handy-keys-event', ({ payload }) => {
        if (!current.active) return
        if (id !== 'cancel' && payload.key === 'escape') { cancel(); return }
        if (payload.is_key_down && payload.hotkey_string) {
          if (payload.key) keyed = payload.hotkey_string
          else modifiersOnly = payload.hotkey_string
          setKeys(payload.hotkey_string)
        } else if (!payload.is_key_down && payload.key) {
          const binding = keyed || payload.hotkey_string
          if (binding) void finish(binding)
        } else if (!payload.is_key_down && !payload.key && !payload.modifiers.length && !keyed && modifiersOnly) {
          void finish(modifiersOnly)
        }
      })
      if (!current.active) { current.stop(); return }
      await api.startHandyKeysRecording(id)
      if (!current.active) await api.stopHandyKeysRecording()
    } catch (reason) {
      current.stop(); current.active = false
      if (session.current === current) { session.current = null; setError(String(reason)); setRecording(false) }
    }
  }
  return { recording, keys, error, start, cancel }
}
