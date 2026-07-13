import { describe, expect, it } from 'vitest'
import { getOverlayBounds } from './overlayWindow'

describe('overlayWindow', () => {
  it('returns stable collapsed bounds without peek height', () => {
    const bounds = getOverlayBounds(100, 100)

    expect(bounds.cardWidth).toBe(612)
    expect(bounds.collapsedWidth).toBe(220)
    expect(bounds.collapsedHeight).toBe(20)
    expect(bounds.expandedHeight).toBe(280)
  })

  it('separates width from whole-widget scaling', () => {
    expect(getOverlayBounds(120, 80)).toEqual({
      cardWidth: 569.6,
      expandedHeight: 224,
      collapsedWidth: 176,
      collapsedHeight: 16,
    })
  })
})
