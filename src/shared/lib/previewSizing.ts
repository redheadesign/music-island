/** Projection onto the initial diagonal keeps corner resizing stable at any aspect ratio. */
export function projectPreviewScale(initial: number, dx: number, dy: number, width: number, height: number) {
  const w = Math.max(1, width), h = Math.max(1, height)
  return initial * (1 + 2 * (dx * w + dy * h) / (w * w + h * h))
}
