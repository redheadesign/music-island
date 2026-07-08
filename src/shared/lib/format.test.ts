import { describe, expect, it } from 'vitest'
import { formatTime, getSourceLabel } from './format'

describe('formatTime', () => {
  it('formats missing and negative values as zero', () => {
    expect(formatTime(null)).toBe('0:00')
    expect(formatTime(-100)).toBe('0:00')
  })

  it('formats milliseconds as m:ss', () => {
    expect(formatTime(73_000)).toBe('1:13')
    expect(formatTime(214_000)).toBe('3:34')
  })
})

describe('getSourceLabel', () => {
  it('normalizes common media sources', () => {
    expect(getSourceLabel('chrome.exe')).toBe('Chrome')
    expect(getSourceLabel('Spotify.exe')).toBe('Spotify')
  })

  it('falls back to a readable app id', () => {
    expect(getSourceLabel(null)).toBe('Windows SMTC')
    expect(getSourceLabel('CustomPlayer.exe')).toBe('CustomPlayer')
  })
})
