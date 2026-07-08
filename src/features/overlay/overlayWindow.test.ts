import { describe, expect, it } from 'vitest'
import { getOverlayBounds } from './overlayWindow'

describe('overlayWindow', () => {
  it('returns stable collapsed bounds without peek height', () => {
    const bounds = getOverlayBounds('medium', 100)

    expect(bounds.collapsedWidth).toBe(220)
    expect(bounds.collapsedHeight).toBe(20)
    expect(bounds.expandedHeight).toBe(280)
  })
})
