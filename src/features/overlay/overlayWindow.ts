import { setOverlayBounds } from '../../app/tauriApi'

export type OverlayWindowPhase = 'collapsed' | 'opening' | 'open' | 'closing'

// Keep `opening` alive briefly so top chrome can finish fading over the animating card.
const OPENING_CHROME_TAIL_MS = 60
const ACTIONS_GUTTER_PER_SIDE = 56

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

export async function syncOverlayWindow(
  phase: OverlayWindowPhase,
  bounds: OverlayBounds,
): Promise<boolean> {
  const operationId = ++boundsOperationId

  if (phase === 'opening') {
    await setOverlayBounds(true, bounds.cardWidth, bounds.expandedHeight)
    if (operationId !== boundsOperationId) {
      return false
    }

    const tailReady = await delay(OPENING_CHROME_TAIL_MS, operationId)
    return tailReady
  }

  const expanded = phase === 'open' || phase === 'closing'

  await setOverlayBounds(
    expanded,
    bounds.cardWidth,
    expanded ? bounds.expandedHeight : bounds.collapsedHeight,
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
    // Hit-band width for native cursor sampling (card + Settings/Pin gutters).
    // The HWND itself is fullscreen; these values only describe the interactive center band.
    cardWidth: (500 * width + ACTIONS_GUTTER_PER_SIDE * 2) * scale,
    // Fallback until ResizeObserver measures the real hover-zone (hugs card + chrome + pad).
    expandedHeight: 300 * scale,
    collapsedWidth: 220 * scale,
    collapsedHeight: 20 * scale,
  }
}
