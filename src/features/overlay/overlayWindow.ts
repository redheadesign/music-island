import { setOverlayBounds } from '../../app/tauriApi'

export type OverlayWindowPhase = 'collapsed' | 'opening' | 'open' | 'closing'

// Keep `opening` alive briefly so top chrome can finish fading over the animating card.
const OPENING_CHROME_TAIL_MS = 60
const ACTIONS_GUTTER_PER_SIDE = 56
const USAGE_GAP = 12
const USAGE_DETAILED_WIDTH = 124
const USAGE_COMPACT_PROVIDER_WIDTH = 84
const USAGE_COMPACT_GAP = 8
const USAGE_COMPACT_HEIGHT = 42
const USAGE_DETAILED_PROVIDER_HEIGHT = 104
const USAGE_DETAILED_PROVIDER_GAP = 8
const USAGE_RIGHT_TOP = 64
/** Extra CSS px beyond measured chrome so the cursor can leave the glyph slightly. */
const HIT_PAD_CSS_PX = 16
export const OVERLAY_CLOSE_GRACE_MS = 280

interface OverlayBounds {
  cardWidth: number
  expandedHeight: number
  collapsedWidth: number
  collapsedHeight: number
}

export interface OverlayUsageBoundsOptions {
  visible: boolean
  scale: number
  visibleWhenCollapsed: boolean
  compact: boolean
  maxProviders: number
}

let boundsOperationId = 0

/**
 * Keeps ordinary pointer transitions inside the short opening grace and lets
 * explicit native reveals reserve a longer, absolute deadline.
 */
export function shouldDeferOverlayClose(
  now: number,
  openedAt: number,
  holdUntil = 0,
): boolean {
  return now - openedAt < OVERLAY_CLOSE_GRACE_MS || now < holdUntil
}

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
      '.island-card, .island-actions, .island-plugins, .island-usage-rail, .island-update-rail, .wave-selection-chip, .wave-wheel',
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
  usage: OverlayUsageBoundsOptions | boolean = false,
): OverlayBounds {
  const width = widthPercent / 100
  const islandScale = scalePercent / 100
  const base = {
    cardWidth: (500 * width + ACTIONS_GUTTER_PER_SIDE * 2) * islandScale,
    expandedHeight: 300 * islandScale,
    collapsedWidth: 220 * islandScale,
    collapsedHeight: 20 * islandScale,
  }

  // Preserve the previous boolean call for callers and characterization tests
  // that still describe the former 160px usage rail.
  if (usage === true) {
    return { ...base, cardWidth: (500 * width + 172 * 2) * islandScale }
  }
  if (usage === false || !usage.visible) return base

  const usageScale = Number.isFinite(usage.scale)
    ? Math.min(1.35, Math.max(0.65, usage.scale))
    : 1
  const providerCount = Number.isFinite(usage.maxProviders) ? Math.trunc(usage.maxProviders) : 1
  const providers = Math.min(2, Math.max(1, providerCount))
  const satelliteWidth = usage.compact
    ? USAGE_COMPACT_PROVIDER_WIDTH * providers + USAGE_COMPACT_GAP * (providers - 1)
    : USAGE_DETAILED_WIDTH
  const centerHalfWidth = 250 * width * islandScale
  const sideExtent = Math.max(
    ACTIONS_GUTTER_PER_SIDE * islandScale,
    USAGE_GAP * islandScale + satelliteWidth * usageScale,
  )
  const detailedHeight = USAGE_DETAILED_PROVIDER_HEIGHT * providers
    + USAGE_DETAILED_PROVIDER_GAP * (providers - 1)
  const satelliteHeight = usage.compact ? USAGE_COMPACT_HEIGHT : detailedHeight

  return {
    // CSS px — converted to physical at setOverlayBounds time.
    // Reserve the larger satellite extent on both sides so the centered island
    // remains stable even when only one side is populated.
    cardWidth: (centerHalfWidth + sideExtent) * 2,
    // Fallback until ResizeObserver measures the real hover-zone.
    expandedHeight: Math.max(base.expandedHeight, USAGE_RIGHT_TOP * islandScale + satelliteHeight * usageScale),
    collapsedWidth: usage.visibleWhenCollapsed
      ? base.collapsedWidth + 2 * (USAGE_GAP * islandScale + (
          USAGE_COMPACT_PROVIDER_WIDTH * providers + USAGE_COMPACT_GAP * (providers - 1)
        ) * usageScale)
      : base.collapsedWidth,
    collapsedHeight: usage.visibleWhenCollapsed
      ? Math.max(base.collapsedHeight, 3 * islandScale + USAGE_COMPACT_HEIGHT * usageScale)
      : base.collapsedHeight,
  }
}
