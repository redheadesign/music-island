import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppConfig } from '../../shared/lib/types'
import { previewConfig } from '../../app/tauriApi'

type SaveConfig = (config: AppConfig, base?: AppConfig) => Promise<void> | void

/** Keep the editable value until its own write succeeds. Native echoes of older
 * saves must never replace edits made while that write was in flight. */
export function useSettingsDraft(config: AppConfig, onChange: SaveConfig) {
  const [draft, setDraft] = useState(config)
  const [saveFailed, setSaveFailed] = useState(false)
  const pending = useRef<AppConfig | null>(null)
  const base = useRef(config)
  const timer = useRef<number | undefined>(undefined)
  const queue = useRef(Promise.resolve())

  useEffect(() => {
    if (pending.current) return
    base.current = config
    setDraft(config)
  }, [config])

  const persist = useCallback((next: AppConfig) => {
    const operation = queue.current.then(async () => {
      await onChange(next, base.current)
      base.current = next
      if (pending.current === next) {
        pending.current = null
        setSaveFailed(false)
      }
    })
    queue.current = operation.catch(() => {
      if (pending.current === next) setSaveFailed(true)
    })
    return operation
  }, [onChange])

  const edit = (next: AppConfig) => {
    window.clearTimeout(timer.current)
    setSaveFailed(false)
    pending.current = next
    setDraft(next)
  }
  const previewAndSave = (next: AppConfig) => {
    edit(next)
    void previewConfig(next).catch(() => undefined)
    timer.current = window.setTimeout(() => { void persist(next).catch(() => undefined) }, 280)
  }
  const saveNow = (next: AppConfig) => {
    edit(next)
    return persist(next)
  }
  const retry = () => {
    if (pending.current) {
      setSaveFailed(false)
      void persist(pending.current).catch(() => undefined)
    }
  }
  return { draft, previewAndSave, saveNow, saveFailed, retry }
}
