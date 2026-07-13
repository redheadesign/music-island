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

export function getOverlayBounds(widthPercent: number, scalePercent: number): OverlayBounds {
  const width = widthPercent / 100
  const scale = scalePercent / 100
  return {
    // Controls sit 44px outside the card. Reserve symmetric native space so
    // Windows can hit-test them while the visual card remains screen-centered.
    cardWidth: (500 * width + ACTIONS_GUTTER_PER_SIDE * 2) * scale,
    expandedHeight: 280 * scale,
    collapsedWidth: 220 * scale,
    collapsedHeight: 20 * scale,
  }
}
