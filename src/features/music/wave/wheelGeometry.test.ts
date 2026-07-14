import { describe, expect, it } from 'vitest'
import {
  getWheelGeometry,
  snapWheelOffset,
  wrapIndex,
} from './wheelGeometry'

describe('wave wheel geometry', () => {
  it('keeps the focused item largest, leftmost and opaque', () => {
    expect(getWheelGeometry(0)).toEqual({
      x: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      zIndex: 100,
    })
  })

  it('moves neighboring items right while shrinking and fading them', () => {
    const first = getWheelGeometry(1)
    const second = getWheelGeometry(2)
    expect(first.x).toBeGreaterThan(0)
    expect(second.x).toBeGreaterThan(first.x)
    expect(second.scale).toBeLessThan(first.scale)
    expect(second.opacity).toBeLessThan(first.opacity)
  })

  it('is symmetric around the focused item', () => {
    const above = getWheelGeometry(-2)
    const below = getWheelGeometry(2)
    expect(above.x).toBe(below.x)
    expect(above.scale).toBe(below.scale)
    expect(above.opacity).toBe(below.opacity)
    expect(above.y).toBe(-below.y)
  })

  it('wraps virtual indexes and snaps offsets', () => {
    expect(wrapIndex(-1, 7)).toBe(6)
    expect(wrapIndex(8, 7)).toBe(1)
    expect(snapWheelOffset(1.62)).toBe(2)
    expect(snapWheelOffset(1.38)).toBe(1)
  })
})
