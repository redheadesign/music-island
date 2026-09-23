import { describe, expect, it } from 'vitest'
import { ACCENT_PRESETS, buildAccentTokens, relativeLuminance } from './accentTheme'
const contrast = (a: string, b: string) => {
  const [low, high] = [relativeLuminance(a), relativeLuminance(b)].sort((x,y) => x-y)
  return (high + .05) / (low + .05)
}
describe('accent presets', () => {
  it.each(ACCENT_PRESETS)('%s separates controls in both themes and keeps labels readable', color => {
    expect(contrast(color, '#303030')).toBeGreaterThanOrEqual(3)
    expect(contrast(color, '#ffffff')).toBeGreaterThanOrEqual(3)
    expect(contrast(color, buildAccentTokens(color).accentInk)).toBeGreaterThanOrEqual(4.5)
  })
  it.each(['#000000', '#ffffff', '#1e3c7b', '#e60000'])('adapts foreground for custom %s', color => {
    expect(contrast(color, buildAccentTokens(color).accentInk)).toBeGreaterThanOrEqual(4.5)
  })
})
