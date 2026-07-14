export interface WheelGeometry {
  x: number
  y: number
  scale: number
  opacity: number
  zIndex: number
}

export const WHEEL_VISIBLE_RADIUS = 4
export const WHEEL_PITCH_PX = 54

export function getWheelGeometry(distance: number, pitch = WHEEL_PITCH_PX): WheelGeometry {
  const magnitude = Math.abs(distance)
  return {
    x: Math.min(54, magnitude * magnitude * 5.5),
    y: distance * pitch,
    scale: clamp(1 - magnitude * 0.105, 0.68, 1),
    opacity: clamp(1 - magnitude * 0.225, 0, 1),
    zIndex: Math.max(1, Math.round(100 - magnitude * 12)),
  }
}

export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0
  return ((index % length) + length) % length
}

export function snapWheelOffset(offset: number): number {
  return Math.round(offset)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}
