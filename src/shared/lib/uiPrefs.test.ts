import { describe, expect, it } from 'vitest'
import type { AppConfig } from './types'
import {
  getUsageWidgetCompact,
  getUsageWidgetScale,
  normalizeUsageWidgetScale,
  withUiPrefs,
} from './uiPrefs'

function configWithUi(ui?: unknown): AppConfig {
  return {
    plugins: { enabled: [], settings: ui === undefined ? {} : { ui } },
  } as unknown as AppConfig
}

describe('usage widget preferences', () => {
  it('keeps legacy and absent configuration at stable defaults', () => {
    expect(getUsageWidgetScale(undefined)).toBe(1)
    expect(getUsageWidgetScale(configWithUi())).toBe(1)
    expect(getUsageWidgetCompact(configWithUi({}))).toBe(true)
  })

  it('accepts finite scale values and clamps the persisted range', () => {
    expect(normalizeUsageWidgetScale(0.8)).toBe(0.8)
    expect(normalizeUsageWidgetScale(0.2)).toBe(0.65)
    expect(normalizeUsageWidgetScale(2)).toBe(1.35)
  })

  it('rejects non-numeric and non-finite scale values', () => {
    expect(normalizeUsageWidgetScale('0.8')).toBe(1)
    expect(normalizeUsageWidgetScale(Number.NaN)).toBe(1)
    expect(normalizeUsageWidgetScale(Number.POSITIVE_INFINITY)).toBe(1)
  })

  it('keeps compact mode unless the literal boolean false disables it', () => {
    expect(getUsageWidgetCompact(configWithUi({ usageWidgetCompact: true }))).toBe(true)
    expect(getUsageWidgetCompact(configWithUi({ usageWidgetCompact: false }))).toBe(false)
    expect(getUsageWidgetCompact(configWithUi({ usageWidgetCompact: 1 }))).toBe(true)
    expect(getUsageWidgetCompact(configWithUi({ usageWidgetCompact: 'false' }))).toBe(true)
  })

  it('round-trips preferences without replacing unrelated UI state', () => {
    const base = configWithUi({ developerMode: true })
    const saved = withUiPrefs(base, { usageWidgetScale: 1.2, usageWidgetCompact: true })
    expect(getUsageWidgetScale(saved)).toBe(1.2)
    expect(getUsageWidgetCompact(saved)).toBe(true)
    expect(saved.plugins.settings.ui).toMatchObject({ developerMode: true })
  })
})
