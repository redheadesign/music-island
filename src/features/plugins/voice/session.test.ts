import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSession, saveSession, type SessionSnapshot } from './session'

const key = 'better-voice-session'
const legacy: SessionSnapshot = {
  version: 1,
  enabled: true,
  strength: 55,
  model: 'rnnoise',
  inputDevice: 'Studio USB',
  outputDevice: 'CABLE Input',
  monitorEnabled: false,
  monitorPoint: 5,
  eqEnabled: true,
  eqBands: [0, 1, 2, 3, 2, 1, 0, -1, -2, -3],
  agcEnabled: false,
  agcTarget: 0.032,
  micGain: 1.25,
  presetId: 'custom',
  fxIntensity: 50,
  engineRunning: true,
}

describe('voice session compatibility characterization', () => {
  let data: Map<string, string>
  beforeEach(() => {
    data = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (name: string) => data.get(name) ?? null,
      setItem: (name: string, value: string) => data.set(name, value),
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each([1, 2] as const)('accepts version %i with its saved device, processing and resume state', (version) => {
    const snapshot = { ...legacy, version }
    data.set(key, JSON.stringify(snapshot))
    expect(loadSession()).toEqual(snapshot)
  })

  it('writes version 2 without changing unrelated settings or its input object', () => {
    saveSession(legacy)
    expect(JSON.parse(data.get(key)!)).toEqual({ ...legacy, version: 2 })
    expect(legacy.version).toBe(1)
  })

  it.each(['{broken', '{"version":3}', 'null'])('ignores unreadable or unsupported saved data: %s', (raw) => {
    data.set(key, raw)
    expect(loadSession()).toBeNull()
  })

  it('allows settings to work when browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('storage unavailable') },
      setItem: () => { throw new Error('storage unavailable') },
    })
    expect(loadSession()).toBeNull()
    expect(() => saveSession(legacy)).not.toThrow()
  })
})
