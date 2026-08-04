import { setOverlayBounds } from '../../app/tauriApi'

export type OverlayWindowPhase = 'collapsed' | 'opening' | 'open' | 'closing'

// Keep `opening` alive briefly so top chrome can finish fading over the animating card.
const OPENING_CHROME_TAIL_MS = 60
const ACTIONS_GUTTER_PER_SIDE = 56
/** Extra CSS px beyond measured chrome so the cursor can leave the glyph slightly. */
const HIT_PAD_CSS_PX = 16

interface OverlayBounds {
  cardWidth: number
  expandedHeight: number
  collapsedWidth: number
  collapsedHeight: number
}

let boundsOperationId = 0

function delay(ms: number, operationId: number): Promise<boolean> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve(operationId === boundsOperationId)
    }, ms)
  })
}

/**
 * Native hit-testing (GetCursorPos / GetWindowRect) is in physical pixels.
 * Layout math in the webview is CSS pixels — without DPR the band is too small on
 * 125%/150% displays and Settings/Pin fall outside it (island closes mid-path).
 */
export function cssToPhysicalHitPx(cssPx: number): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  return cssPx * dpr
}

/**
 * Centered hit-band size that covers the real chrome (including Settings/Pin).
 * Uses the larger of left/right extent from the viewport center so asymmetric
 * action buttons still sit inside a centered native band.
 */
export function measureExpandedHitBand(zone: HTMLElement): {
  width: number
  height: number
} {
  const centerX = window.innerWidth / 2
  let left = zone.getBoundingClientRect().left
  let right = zone.getBoundingClientRect().right
  let top = zone.getBoundingClientRect().top
  let bottom = zone.getBoundingClientRect().bottom

  zone
    .querySelectorAll(
      '.island-card, .island-actions, .island-plugins, .island-update-rail, .wave-selection-chip, .wave-wheel',
    )
    .forEach((node) => {
      const rect = node.getBoundingClientRect()
      left = Math.min(left, rect.left)
      right = Math.max(right, rect.right)
      top = Math.min(top, rect.top)
      bottom = Math.max(bottom, rect.bottom)
    })

  const halfWidth = Math.max(centerX - left, right - centerX, 80)
  const widthCss = halfWidth * 2 + HIT_PAD_CSS_PX
  // Band starts at the top of the HWND (y=0); cover from viewport top through chrome.
  const heightCss = Math.max(bottom, 0) + HIT_PAD_CSS_PX

  return {
    width: cssToPhysicalHitPx(widthCss),
    height: cssToPhysicalHitPx(Math.max(heightCss, 96)),
  }
}

export async function syncOverlayWindow(
  phase: OverlayWindowPhase,
  bounds: OverlayBounds,
): Promise<boolean> {
  const operationId = ++boundsOperationId

  if (phase === 'opening') {
    await setOverlayBounds(
      true,
      cssToPhysicalHitPx(bounds.cardWidth),
      cssToPhysicalHitPx(bounds.expandedHeight),
    )
    if (operationId !== boundsOperationId) {
      return false
    }

    const tailReady = await delay(OPENING_CHROME_TAIL_MS, operationId)
    return tailReady
  }

  const expanded = phase === 'open' || phase === 'closing'

  await setOverlayBounds(
    expanded,
    cssToPhysicalHitPx(expanded ? bounds.cardWidth : bounds.collapsedWidth),
    cssToPhysicalHitPx(expanded ? bounds.expandedHeight : bounds.collapsedHeight),
  )

  return operationId === boundsOperationId
}

export function cancelOverlayWindowOperations(): void {
  boundsOperationId += 1
}

export function getOverlayBounds(
  widthPercent: number,
  scalePercent: number,
): OverlayBounds {
  const width = widthPercent / 100
  const scale = scalePercent / 100
  return {
    // CSS px — converted to physical at setOverlayBounds time.
    cardWidth: (500 * width + ACTIONS_GUTTER_PER_SIDE * 2) * scale,
    // Fallback until ResizeObserver measures the real hover-zone.
    expandedHeight: 300 * scale,
    collapsedWidth: 220 * scale,
    collapsedHeight: 20 * scale,
  }
}
