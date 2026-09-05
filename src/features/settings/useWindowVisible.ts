import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useState } from 'react'

function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window
}

/**
 * True while the current Tauri window is visible (settings hide() → false).
 * Falls back to document.visibilityState outside Tauri.
 */
export function useWindowVisible(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden',
  )

  useEffect(() => {
    let cancelled = false
    let unFocus: (() => void) | undefined

    const sync = async () => {
      if (!isTauriRuntime()) {
        if (!cancelled) setVisible(document.visibilityState !== 'hidden')
        return
      }
      try {
        const next = await getCurrentWindow().isVisible()
        if (!cancelled) setVisible(next)
      } catch {
        if (!cancelled) setVisible(document.visibilityState !== 'hidden')
      }
    }

    const onDomVisibility = () => {
      void sync()
    }

    void sync()
    document.addEventListener('visibilitychange', onDomVisibility)
    window.addEventListener('focus', onDomVisibility)
    window.addEventListener('blur', onDomVisibility)

    if (isTauriRuntime()) {
      void getCurrentWindow()
        .onFocusChanged(() => {
          void sync()
        })
        .then((fn) => {
          if (cancelled) fn()
          else unFocus = fn
        })
    }

    return () => {
      cancelled = true
      unFocus?.()
      document.removeEventListener('visibilitychange', onDomVisibility)
      window.removeEventListener('focus', onDomVisibility)
      window.removeEventListener('blur', onDomVisibility)
    }
  }, [])

  return visible
}
