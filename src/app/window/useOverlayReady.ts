import { useEffect } from 'react'
import { resetWindowPosition, showOverlayReady } from '../tauriApi'

/** The native window is hidden until config and the final viewport are committed.
 * Hidden WebViews may pause RAF, so a cancellable timer drives the acknowledgement. */
export function useOverlayReady(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    let attempts = 0
    const show = async () => {
      if (!active) return
      try {
        const shown = await showOverlayReady(window.innerWidth, window.innerHeight)
        if (!shown && active) timer = setTimeout(show, 100)
      } catch (error) {
        if (active && ++attempts < 5) timer = setTimeout(show, 200)
        else if (active) console.error('Could not show the overlay', error)
      }
    }
    void resetWindowPosition().catch(error => console.warn('Initial monitor placement failed', error)).then(() => {
      if (active) timer = setTimeout(show, 60)
    })
    return () => { active = false; clearTimeout(timer) }
  }, [enabled])
}
