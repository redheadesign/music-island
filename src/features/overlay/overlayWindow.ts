import { setOverlayBounds } from '../../app/tauriApi'

export type OverlayWindowPhase = 'collapsed' | 'opening' | 'open' | 'closing'

// Keep `opening` alive briefly so top chrome can finish fading over the animating card.
const OPENING_CHROME_TAIL_MS = 60

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

export function getOverlayBounds(size: 'small' | 'medium' | 'large', scalePercent: number): OverlayBounds {
  const scale = scalePercent / 100
  return {
    cardWidth: getIslandCardWidth(size) * scale,
    expandedHeight: 280,
    collapsedWidth: 220 * scale,
    collapsedHeight: 20,
  }
}

function getIslandCardWidth(size: 'small' | 'medium' | 'large'): number {
  if (size === 'small') {
    return 410
  }
  if (size === 'large') {
    return 600
  }
  return 500
}
