import { useLayoutEffect } from 'react'
import { DEFAULT_GLASS_MATERIAL } from '../lib/glassMaterial'
import { getInterfaceThemeDefinition, isInterfaceThemeId } from '../lib/interfaceTheme'

const controlSelector = [
  '.ui-button',
  ':is(.island-root, .dictation-overlay) :is(button, a[href], input, [role="button"], [role="slider"])',
  '[data-island-control]',
].join(', ')
const quietSelector = '[data-reduced-motion="true"], [data-reduced-transparency="true"], .reduced-motion'

function surfaceAt(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>(controlSelector) : null
}

/** Paint only the hovered rim. No animation clock runs between pointer events. */
export function useGlassPointerLight(enabled: boolean) {
  // The first pointermove may be the event that opened the desktop overlay.
  // Attach during commit so the first painted frame can respond to its pointer.
  useLayoutEffect(() => {
    if (!enabled) return

    const systemQuiet = matchMedia('(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)')
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
      const setting = getComputedStyle(next.control).getPropertyValue('--glass-parallax-strength')
      const strength = setting ? Number.parseFloat(setting) : DEFAULT_GLASS_MATERIAL.parallax / 100
      if (!(strength > 0)) return reset()
      const rect = next.control.getBoundingClientRect()
      if (!rect.width || !rect.height) return reset()
      const percent = (fraction: number) => `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`
      const clamp = Math.min(strength, 1)
      next.control.style.setProperty('--glass-light-x', percent(.5 + (((next.x - rect.left) / rect.width) - .5) * clamp))
      next.control.style.setProperty('--glass-light-y', percent(.5 + (((next.y - rect.top) / rect.height) - .5) * clamp))
      next.control.setAttribute('data-glass-light', '')
      active = next.control
    }

    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || systemQuiet.matches || document.hidden) return reset()
      const control = surfaceAt(event.target)
      const theme = control?.closest('[data-interface-theme]')?.getAttribute('data-interface-theme')
      if (!control || !isInterfaceThemeId(theme) || getInterfaceThemeDefinition(theme).material !== 'glass'
        || control.matches('.island-editor-element, [data-island-control="glyph"], [data-island-control="plain"], :disabled, [aria-disabled="true"]') || control.closest(quietSelector)) return reset()

      if (active && active !== control) removeLight()
      pending = { control, x: event.clientX, y: event.clientY }
      if (!frame) frame = requestAnimationFrame(paint)
    }

    const leave = (event: PointerEvent) => {
      const target = pending?.control ?? active
      if (target && surfaceAt(event.relatedTarget) !== target) reset()
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
