import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cssToPhysicalHitPx,
  getOverlayBounds,
  shouldDeferOverlayClose,
} from './overlayWindow'

describe('overlayWindow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns stable collapsed bounds without peek height', () => {
    const bounds = getOverlayBounds(100, 100)

    expect(bounds.cardWidth).toBe(612)
    expect(bounds.collapsedWidth).toBe(220)
    expect(bounds.collapsedHeight).toBe(20)
    expect(bounds.expandedHeight).toBe(300)
  })

  it('separates width from whole-widget scaling', () => {
    expect(getOverlayBounds(120, 80)).toEqual({
      cardWidth: 569.6,
      expandedHeight: 240,
      collapsedWidth: 176,
      collapsedHeight: 16,
    })
  })

  it('converts CSS hit sizes to physical pixels for native sampling', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1.5 })
    expect(cssToPhysicalHitPx(612)).toBe(918)
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    expect(cssToPhysicalHitPx(612)).toBe(612)
  })

  it('keeps the legacy boolean usage reservation backward compatible', () => {
    const without = getOverlayBounds(100, 100)
    const withUsage = getOverlayBounds(100, 100, true)
    expect(withUsage.collapsedWidth).toBe(without.collapsedWidth)
    expect(withUsage.collapsedHeight).toBe(without.collapsedHeight)
    expect(withUsage.cardWidth).toBe(844)
  })

  it('reserves the independent detailed satellite scale outside the island', () => {
    const bounds = getOverlayBounds(100, 65, {
      visible: true,
      scale: 1.35,
      visibleWhenCollapsed: false,
      compact: false,
      maxProviders: 2,
    })
    const islandHalfWidth = 250 * 0.65
    const requiredSideExtent = 12 * 0.65 + 124 * 1.35
    expect(bounds.cardWidth / 2).toBeGreaterThanOrEqual(islandHalfWidth + requiredSideExtent)
    expect(bounds.expandedHeight).toBeGreaterThanOrEqual(64 * 0.65 + (104 * 2 + 8) * 1.35)
    expect(bounds.collapsedWidth).toBe(220 * 0.65)
  })

  it('covers one or two compact providers and the always-visible collapsed rail', () => {
    const one = getOverlayBounds(100, 100, {
      visible: true, scale: 1, visibleWhenCollapsed: true, compact: true, maxProviders: 1,
    })
    const two = getOverlayBounds(100, 100, {
      visible: true, scale: 1, visibleWhenCollapsed: true, compact: true, maxProviders: 2,
    })
    expect(one.cardWidth).toBe(692)
    expect(one.collapsedWidth).toBe(412)
    expect(two.cardWidth).toBe(876)
    expect(two.collapsedWidth).toBe(596)
    expect(two.collapsedHeight).toBe(45)
  })

  it('normalizes unsafe usage scale and provider counts at the bounds boundary', () => {
    const invalid = getOverlayBounds(100, 100, {
      visible: true, scale: Number.NaN, visibleWhenCollapsed: true, compact: true, maxProviders: 99,
    })
    const normalized = getOverlayBounds(100, 100, {
      visible: true, scale: 1, visibleWhenCollapsed: true, compact: true, maxProviders: 2,
    })
    expect(invalid).toEqual(normalized)
  })

  it('defers close during the normal opening grace', () => {
    expect(shouldDeferOverlayClose(1_279, 1_000)).toBe(true)
    expect(shouldDeferOverlayClose(1_280, 1_000)).toBe(false)
  })

  it('defers close until an explicit reveal deadline even after opening grace', () => {
    expect(shouldDeferOverlayClose(3_999, 1_000, 4_000)).toBe(true)
    expect(shouldDeferOverlayClose(4_000, 1_000, 4_000)).toBe(false)
  })

  it('does not let an expired reveal deadline extend the normal grace', () => {
    expect(shouldDeferOverlayClose(1_100, 1_000, 900)).toBe(true)
    expect(shouldDeferOverlayClose(1_500, 1_000, 1_400)).toBe(false)
  })
})
