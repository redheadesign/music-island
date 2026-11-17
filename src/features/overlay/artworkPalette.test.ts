import { describe, expect, it } from 'vitest'
import { relativeLuminance } from '../../shared/lib/accentTheme'
import { artworkCssColors, progressFillColor, selectArtworkPalette } from './artworkPalette'

const pixels = (...groups: Array<{ rgba: [number, number, number, number]; count: number }>) =>
  new Uint8ClampedArray(groups.flatMap(({ rgba, count }) => Array.from({ length: count }, () => rgba).flat()))

describe('artwork palette', () => {
  it('keeps the cover’s actual colors for Glass', () => {
    const palette = selectArtworkPalette(pixels(
      { rgba: [24, 133, 212, 255], count: 100 },
      { rgba: [25, 175, 187, 255], count: 42 },
    ))
    expect(palette).toEqual({ primary: [24, 133, 212], secondary: [25, 175, 187] })
    expect(artworkCssColors(palette, true)).toEqual({ primary: '24, 133, 212', secondary: '25, 175, 187' })
  })

  it('does not let black borders, transparency or a tiny stray pixel pick the palette', () => {
    const palette = selectArtworkPalette(pixels(
      { rgba: [0, 0, 0, 255], count: 200 },
      { rgba: [0, 250, 0, 0], count: 200 },
      { rgba: [232, 107, 48, 255], count: 30 },
      { rgba: [5, 36, 250, 255], count: 1 },
    ))
    expect(palette).toEqual({ primary: [232, 107, 48], secondary: [232, 107, 48] })
  })

  it('uses the neutral fallback for artwork without usable color', () => {
    const palette = selectArtworkPalette(pixels({ rgba: [210, 210, 210, 255], count: 24 }))
    expect(palette).toBeNull()
    expect(artworkCssColors(palette, true)).toEqual({ primary: '26, 30, 40', secondary: '10, 12, 18' })
  })
})

it.each([
  [242, 106, 18], [8, 78, 133], [250, 225, 47], [26, 244, 191],
  [255, 247, 242], [245, 0, 245], [6, 2, 18], [175, 175, 175], [0, 0, 0],
])('keeps a bright readable fill for cover rgb(%i,%i,%i)', (red, green, blue) => {
  const result = progressFillColor([red, green, blue])
  const ratio = (relativeLuminance('#f4f4f1') + .05) / (relativeLuminance(result) + .05)
  expect(ratio).toBeGreaterThanOrEqual(4.65)
  expect(ratio).toBeLessThan(4.9)
})
