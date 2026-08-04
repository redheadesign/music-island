import { afterEach, describe, expect, it, vi } from 'vitest'
import { cssToPhysicalHitPx, getOverlayBounds } from './overlayWindow'

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
})
