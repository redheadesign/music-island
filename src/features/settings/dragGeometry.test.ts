import { describe, expect, it } from 'vitest'
import { captureDragGeometry, dragPosition } from './dragGeometry'

describe('preview drag geometry', () => {
  it.each([.5, .8, 1, 1.25, 1.5, 2])('keeps the grabbed point at scale %s', (scale) => {
    const bounds = { left: 360, top: 120, width: 124 * scale, height: 40 * scale }
    const point = { x: bounds.left + 19 * scale, y: bounds.top + 11 * scale }
    const grab = captureDragGeometry(bounds, point.x, point.y)
    const position = dragPosition(grab, point.x + 71, point.y - 32)
    expect(position.left).toBe(bounds.left + 71)
    expect(position.top).toBe(bounds.top - 32)
    expect(grab.width).toBe(bounds.width)
    expect(grab.height).toBe(bounds.height)
  })
})
