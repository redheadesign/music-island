import { describe, expect, it } from 'vitest'
import type { AppConfig } from './types'
import {
  canPlaceIslandElement,
  getIslandLayout,
  getLegacyIslandLayout,
  moveIslandElement,
  normalizeIslandLayout,
  removeIslandElement,
  withIslandLayout,
  zoneForIslandElement,
} from './islandLayout'

function config(): AppConfig {
  return {
    schemaVersion: 1,
    taskbar: { enabled: false },
    appearance: { theme: 'liquid-glass-dark', accentColor: '#ff9f0a', opacity: 0.8, blurStrength: 20, cornerRadius: 20, reducedMotion: false, locale: 'ru' },
    layout: { size: 'medium', width: 420, scale: 1, density: 'balanced', showArtwork: true, showTitle: true, showArtist: true, showProgress: false, showSource: false, showPreviousNext: true, preset: 'clean-controls' },
    behavior: { hoverDelayMs: 100, autoCollapseMs: 1000, pinExpanded: true, alwaysOnTop: true, launchAtStartup: false, hideOverFullscreen: true, monitorId: null },
    modules: { activeModule: 'music', enabledModules: ['music'] },
    privacy: { telemetryEnabled: false, writeDetailedLogs: false },
    media: { protocol: 'smtc', preferredSourceAppId: null, directYandexConsent: false, directYandexPort: null },
    plugins: { enabled: [], settings: { usage: { codexEnabled: true, claudeEnabled: true } } },
  }
}

describe('island layout policy', () => {
  it('normalizes corrupt values and preserves required safe-zone controls', () => {
    expect(normalizeIslandLayout({ version: 2, zones: {
      left: ['codex', 'codex', 'unknown'],
      player: ['next', 'progress', 'artwork', 'artwork'],
      right: ['codex', 'claude', 'unknown'],
      reactionLeft: ['shuffle', 'like', 'like', 'unknown', 'dislike'],
      reactionRight: ['like', 'repeat', 'shuffle'],
      actions: ['pin', 'pin'],
    } })).toEqual({
      version: 2,
      zones: {
        left: ['codex'],
        player: ['next', 'progress', 'artwork', 'transport'],
        right: ['claude'],
        reactionLeft: ['shuffle', 'like', 'dislike'],
        reactionRight: ['repeat'],
        actions: ['settings', 'pin'],
      },
    })
  })

  it('migrates v1 navigation into independent controls and adds reaction defaults', () => {
    const migrated = normalizeIslandLayout({ version: 1, zones: {
      left: [], player: ['artwork', 'navigation', 'transport', 'progress'], right: [], actions: ['settings'],
    } })
    expect(migrated).toEqual({ version: 2, zones: {
      left: [],
      player: ['previous', 'artwork', 'transport', 'next', 'progress'],
      right: [],
      reactionLeft: ['dislike'],
      reactionRight: ['like'],
      actions: ['settings'],
    } })
  })

  it('derives unsaved defaults from legacy flags and strict provider opt-ins', () => {
    const value = getLegacyIslandLayout(config())
    expect(value.zones).toEqual({
      left: ['codex'],
      player: ['previous', 'artwork', 'transport', 'next'],
      right: ['claude'],
      reactionLeft: ['dislike'],
      reactionRight: ['like'],
      actions: ['settings', 'pin'],
    })
  })

  it('moves a provider between satellites instead of duplicating it', () => {
    const value = getLegacyIslandLayout(config())
    const moved = moveIslandElement(value, 'codex', 'right', 0)
    expect(moved.zones.left).toEqual([])
    expect(moved.zones.right).toEqual(['codex', 'claude'])
  })

  it('never removes transport or settings', () => {
    const value = getLegacyIslandLayout(config())
    expect(removeIslandElement(value, 'transport')).toEqual(value)
    expect(removeIslandElement(value, 'settings')).toEqual(value)
  })

  it('moves reactions between sides by inserting without displacing a neighbor', () => {
    const value = getLegacyIslandLayout(config())
    const moved = moveIslandElement(value, 'like', 'reactionLeft')
    expect(moved.zones.reactionLeft).toEqual(['dislike', 'like'])
    expect(moved.zones.reactionRight).toEqual([])
    expect(canPlaceIslandElement(moved, 'like', 'left')).toBe(false)
  })

  it('places Like on the left when that reaction slot is empty', () => {
    const withoutDislike = removeIslandElement(getLegacyIslandLayout(config()), 'dislike')
    const moved = moveIslandElement(withoutDislike, 'like', 'reactionLeft')
    expect(moved.zones.reactionLeft).toEqual(['like'])
    expect(moved.zones.reactionRight).toEqual([])
  })

  it('removes optional reactions to the catalog without restoring defaults', () => {
    const value = removeIslandElement(getLegacyIslandLayout(config()), 'like')
    expect(value.zones.reactionLeft).toEqual(['dislike'])
    expect(value.zones.reactionRight).toEqual([])
  })

  it('keeps shuffle and repeat optional, ordered, and unique across reaction sides', () => {
    const defaults = getLegacyIslandLayout(config())
    expect(defaults.zones.reactionLeft).toEqual(['dislike'])
    expect(defaults.zones.reactionRight).toEqual(['like'])
    expect(zoneForIslandElement('shuffle')).toBe('reactionLeft')
    expect(zoneForIslandElement('repeat')).toBe('reactionRight')
    expect(canPlaceIslandElement(defaults, 'shuffle', 'reactionLeft')).toBe(true)
    expect(canPlaceIslandElement(defaults, 'repeat', 'reactionLeft')).toBe(true)
    expect(canPlaceIslandElement(defaults, 'shuffle', 'player')).toBe(false)

    let edited = moveIslandElement(defaults, 'shuffle', 'reactionLeft', 0)
    edited = moveIslandElement(edited, 'repeat', 'reactionRight', 0)
    expect(edited.zones.reactionLeft).toEqual(['shuffle', 'dislike'])
    expect(edited.zones.reactionRight).toEqual(['repeat', 'like'])

    edited = moveIslandElement(edited, 'repeat', 'reactionLeft', 1)
    expect(edited.zones.reactionLeft).toEqual(['shuffle', 'repeat', 'dislike'])
    expect(edited.zones.reactionRight).toEqual(['like'])
    expect([...edited.zones.reactionLeft, ...edited.zones.reactionRight].filter((item) => item === 'repeat')).toHaveLength(1)
  })

  it('round-trips a normalized v2 layout without replacing unrelated ui prefs', () => {
    const base = config()
    base.plugins.settings.ui = { developerMode: true }
    const edited = removeIslandElement(getIslandLayout(base), 'artwork')
    const saved = withIslandLayout(base, edited)
    expect((saved.plugins.settings.ui as Record<string, unknown>).developerMode).toBe(true)
    expect(getIslandLayout(saved)).toEqual(edited)
    expect(saved.layout.showArtwork).toBe(false)
    expect(saved.layout.showPreviousNext).toBe(true)
    expect(saved.layout.showProgress).toBe(false)
  })

  it('keeps player order and enables the legacy navigation flag with either control', () => {
    const base = config()
    let edited = removeIslandElement(getIslandLayout(base), 'previous')
    edited = moveIslandElement(edited, 'artwork', 'player', 0)
    const savedWithNext = withIslandLayout(base, edited)
    expect(savedWithNext.layout.showPreviousNext).toBe(true)
    expect(getIslandLayout(savedWithNext).zones.player).toEqual(['artwork', 'transport', 'next'])
    const savedWithoutBoth = withIslandLayout(base, removeIslandElement(edited, 'next'))
    expect(savedWithoutBoth.layout.showPreviousNext).toBe(false)
  })

  it('clears pinned state when the pin action is removed', () => {
    const base = config()
    const edited = removeIslandElement(getLegacyIslandLayout(base), 'pin')
    const saved = withIslandLayout(base, edited)
    expect(saved.behavior.pinExpanded).toBe(false)
    expect(getIslandLayout(saved).zones.actions).toEqual(['settings'])
  })

  it('falls back to legacy defaults for unsupported saved versions', () => {
    const base = config()
    base.plugins.settings.ui = { islandLayout: { version: 99, zones: {} } }
    expect(getIslandLayout(base)).toEqual(getLegacyIslandLayout(base))
  })

  it('loads and migrates a persisted v1 layout', () => {
    const base = config()
    base.plugins.settings.ui = { islandLayout: { version: 1, zones: {
      left: ['codex'], player: ['navigation', 'transport'], right: [], actions: ['settings', 'pin'],
    } } }
    expect(getIslandLayout(base).zones).toMatchObject({
      player: ['previous', 'transport', 'next'], reactionLeft: ['dislike'], reactionRight: ['like'],
    })
  })
})
