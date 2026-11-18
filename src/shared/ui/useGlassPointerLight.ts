import { useEffect } from 'react'
import { getInterfaceThemeDefinition, isInterfaceThemeId } from '../lib/interfaceTheme'

const controlSelector = [
  '.ui-button',
  '.media-button', '.play-button', '.reaction-button', '.island-actions .icon-button:not(.island-settings-button)', '.island-plugin-button',
].join(', ')
const quietSelector = '[data-reduced-motion="true"], [data-reduced-transparency="true"], .reduced-motion'

/** Paint only the hovered rim. No animation clock runs between pointer events. */
export function useGlassPointerLight(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    const systemQuiet = matchMedia('(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce), (forced-colors: active)')
    let active: HTMLElement | null = null
    let pending: { control: HTMLElement; x: number; y: number } | null = null
    let frame = 0

    const removeLight = () => {
      active?.removeAttribute('data-glass-light')
      active?.style.removeProperty('--glass-light-x')
      active?.style.removeProperty('--glass-light-y')
      active = null
    }

    const reset = () => {
      cancelAnimationFrame(frame)
      frame = 0
      pending = null
      removeLight()
    }

    const paint = () => {
      frame = 0
      const next = pending
      pending = null
      if (!next?.control.isConnected) return reset()
      if (active !== next.control) removeLight()
      const rect = next.control.getBoundingClientRect()
      if (!rect.width || !rect.height) return reset()
      const percent = (fraction: number) => `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`
      next.control.style.setProperty('--glass-light-x', percent((next.x - rect.left) / rect.width))
      next.control.style.setProperty('--glass-light-y', percent((next.y - rect.top) / rect.height))
      next.control.setAttribute('data-glass-light', '')
      active = next.control
    }

    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || systemQuiet.matches || document.hidden) return reset()
      const control = event.target instanceof Element ? event.target.closest<HTMLElement>(controlSelector) : null
      const theme = control?.closest('[data-interface-theme]')?.getAttribute('data-interface-theme')
      if (!control || !isInterfaceThemeId(theme) || getInterfaceThemeDefinition(theme).material !== 'glass'
        || control.matches(':disabled, [aria-disabled="true"]') || control.closest(quietSelector)) return reset()

      pending = { control, x: event.clientX, y: event.clientY }
      if (!frame) frame = requestAnimationFrame(paint)
    }

    const leave = (event: PointerEvent) => {
      const target = pending?.control ?? active
      if (target && event.target instanceof Node && target.contains(event.target)
        && (!(event.relatedTarget instanceof Node) || !target.contains(event.relatedTarget))) reset()
    }

    document.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerout', leave, { passive: true })
    document.addEventListener('visibilitychange', reset)
    systemQuiet.addEventListener('change', reset)
    return () => {
      reset()
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerout', leave)
      document.removeEventListener('visibilitychange', reset)
      systemQuiet.removeEventListener('change', reset)
    }
  }, [enabled])
}
