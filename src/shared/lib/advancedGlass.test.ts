import { describe, expect, it } from 'vitest'
import { getSurfaceDefaults, normalizeAdvancedGlass } from './advancedGlass'
import { DEFAULT_GLASS_MATERIAL } from './glassMaterialTokens'

describe('per-surface glass', () => {
  it('keeps intentional zeros, clamps finite values, and validates color tokens', () => {
    expect(normalizeAdvancedGlass({
      body: { frost: 45, background: '#AbCdEf', text: 'red; opacity:0', bend: 0, rim: 1 },
      transport: { dispersion: .4, frost: 1.6666, highlight: NaN, parallax: Infinity },
      progressFill: { angle: -20, text: '#000000', brightness: 195 }, unknown: { rim: .5 },
    })).toEqual({ body: { frost: 32, background: '#abcdef' }, transport: { dispersion: .4, frost: 1.7 }, progressFill: { brightness: 180 } })
  })

  it('drops retired or malformed overrides without materializing defaults', () => {
    for (const value of [null, [], {}, { body: { rim: 1 }, notices: {}, progressTrack: 'none' }]) {
      expect(normalizeAdvancedGlass(value)).toEqual({})
    }
  })

  it('merges legacy button dials while keeping play and detached widgets independent', () => {
    expect(normalizeAdvancedGlass({
      transport: { frost: 5.7 }, seek: { bend: .25 }, reactions: { frost: 7.5 },
      localServers: { frost: 32, dispersion: .8 }, progressFill: { radius: 7, dispersion: .4 },
    })).toEqual({
      transport: { frost: 5.7 }, buttons: { bend: .25, frost: 7.5 },
      localServers: { frost: 32 }, progressFill: { radius: 7 },
    })
    expect(normalizeAdvancedGlass({ reactions: { frost: 7.5 }, buttons: { frost: 0 } })).toEqual({ buttons: { frost: 0 } })
  })

  it('derives separate default frost for native silhouettes and controls above the player', () => {
    expect(getSurfaceDefaults('usage', DEFAULT_GLASS_MATERIAL).frost).toBe(6.4)
    expect(getSurfaceDefaults('transport', DEFAULT_GLASS_MATERIAL).frost).toBe(0)
  })
})
