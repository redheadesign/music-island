import { describe, expect, it } from 'vitest'
import { getSurfaceDefaults, normalizeAdvancedGlass } from './advancedGlass'
import { DEFAULT_GLASS_MATERIAL } from './glassMaterialTokens'

describe('per-surface glass', () => {
  it('keeps intentional zeros, clamps finite values, and validates color tokens', () => {
    expect(normalizeAdvancedGlass({
      body: { frost: 45, background: '#AbCdEf', text: 'red; opacity:0', bend: 0, rim: 1 },
      transport: { dispersion: .4, frost: 1.6666, highlight: NaN, parallax: Infinity },
      progressFill: { angle: -20, text: '#000000' }, unknown: { rim: .5 },
    })).toEqual({ body: { frost: 32, background: '#abcdef', bend: 0 }, transport: { dispersion: .4, frost: 1.7 }, progressFill: { angle: 0 } })
  })

  it('drops retired or malformed overrides without materializing defaults', () => {
    for (const value of [null, [], {}, { body: { rim: 1 }, notices: {}, progressTrack: 'none' }]) {
      expect(normalizeAdvancedGlass(value)).toEqual({})
    }
  })

  it('derives separate default frost for native silhouettes and controls above the player', () => {
    expect(getSurfaceDefaults('usage', DEFAULT_GLASS_MATERIAL).frost).toBe(27.2)
    expect(getSurfaceDefaults('transport', DEFAULT_GLASS_MATERIAL).frost).toBe(0)
  })
})
