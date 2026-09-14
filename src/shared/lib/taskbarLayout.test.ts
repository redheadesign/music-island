import { describe, expect, it } from 'vitest'
import type { AppConfig } from './types'
import {
  DEFAULT_TASKBAR_ELEMENTS,
  getTaskbarLayout,
  normalizeTaskbarLayout,
  withTaskbarLayout,
} from './taskbarLayout'

function config(showLike = false, ui: unknown = undefined): AppConfig {
  return {
    taskbar: { enabled: true, scale: 1, showLike },
    plugins: { enabled: [], settings: ui === undefined ? {} : { ui } },
  } as unknown as AppConfig
}

describe('taskbar layout policy', () => {
  it('uses the established four-control default', () => {
    expect(getTaskbarLayout(config()).elements).toEqual(DEFAULT_TASKBAR_ELEMENTS)
  })

  it('migrates the legacy Like flag without losing the default order', () => {
    expect(getTaskbarLayout(config(true)).elements).toEqual([
      'cover', 'previous', 'transport', 'next', 'like',
    ])
  })

  it('preserves safe user order while removing unknown values and duplicates', () => {
    expect(normalizeTaskbarLayout({ version: 1, elements: [
      'repeat', 'cover', 'repeat', 'unknown', 'shuffle', 'next',
    ] })).toEqual({ version: 1, elements: ['repeat', 'cover', 'shuffle', 'next', 'transport'] })
  })

  it('allows every optional control to be removed but restores transport', () => {
    expect(normalizeTaskbarLayout({ version: 1, elements: [] }).elements).toEqual(['transport'])
    expect(normalizeTaskbarLayout({ version: 1, elements: ['like'] }).elements).toEqual(['like', 'transport'])
  })

  it('falls back for malformed and unsupported saved values', () => {
    expect(getTaskbarLayout(config(false, { taskbarLayout: { version: 99, elements: ['like'] } })).elements)
      .toEqual(DEFAULT_TASKBAR_ELEMENTS)
    expect(normalizeTaskbarLayout({ elements: 'cover' }).elements).toEqual(DEFAULT_TASKBAR_ELEMENTS)
    expect(getTaskbarLayout(config(true, { taskbarLayout: { version: 1, elements: 'cover' } })).elements)
      .toEqual(['cover', 'previous', 'transport', 'next', 'like'])
  })

  it('persists normalized layout and mirrors Like without replacing unrelated preferences', () => {
    const saved = withTaskbarLayout(config(false, { developerMode: true }), {
      version: 1,
      elements: ['shuffle', 'like', 'transport'],
    })
    expect(getTaskbarLayout(saved).elements).toEqual(['shuffle', 'like', 'transport'])
    expect(saved.taskbar.showLike).toBe(true)
    expect(saved.plugins.settings.ui).toMatchObject({ developerMode: true })

    const withoutLike = withTaskbarLayout(saved, { version: 1, elements: ['transport'] })
    expect(withoutLike.taskbar.showLike).toBe(false)
  })
})
