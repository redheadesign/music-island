import { describe, expect, it } from 'vitest'
import type { AppConfig } from './types'
import {
  canPlaceIslandElement,
  getIslandLayout,
  islandArrangement,
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
  it('keeps system volume optional, unique and movable between saved rows', () => {
    const base = config()
    const original = getIslandLayout(base)
    expect(original.zones.player).not.toContain('volume')
    expect(original.zones.playerLower).not.toContain('volume')
    const top = moveIslandElement(original, 'volume', 'player', 0)
    expect(top.zones.player[0]).toBe('volume')
    const lower = getIslandLayout(withIslandLayout(base, moveIslandElement(top, 'volume', 'playerLower', 0)))
    expect(lower.zones.playerLower[0]).toBe('volume')
    expect(lower.zones.player).not.toContain('volume')
    expect(removeIslandElement(lower, 'volume').zones.playerLower).not.toContain('volume')
  })
  it('normalizes corrupt values and preserves required safe-zone controls', () => {
    expect(normalizeIslandLayout({ version: 2, zones: {
      left: ['codex', 'codex', 'unknown'],
      player: ['next', 'progress', 'artwork', 'artwork'],
      right: ['codex', 'claude', 'unknown'],
      reactionLeft: ['shuffle', 'like', 'like', 'unknown', 'dislike'],
      reactionRight: ['like', 'repeat', 'shuffle'],
      actions: ['pin', 'pin'],
    } })).toEqual({
      version: 4,
      zones: {
        left: ['codex'],
        player: ['next', 'artwork', 'transport'],
        right: ['claude'],
        playerLower: ['shuffle', 'like', 'dislike', 'progress', 'repeat'],
        actions: ['settings', 'pin'],
        bottom: [],
      },
    })
  })

  it('migrates v1 navigation into independent controls and adds reaction defaults', () => {
    const migrated = normalizeIslandLayout({ version: 1, zones: {
      left: [], player: ['artwork', 'navigation', 'transport', 'progress'], right: [], actions: ['settings'],
    } })
    expect(migrated).toEqual({ version: 4, zones: {
      left: [],
      player: ['previous', 'artwork', 'transport', 'next'],
      right: [],
      playerLower: ['dislike', 'progress', 'like'],
      actions: ['settings'],
      bottom: [],
    } })
  })

  it('keeps the composition of v2 profiles and persists inline reordering', () => {
    const base = config()
    base.plugins.settings.ui = { islandLayout: { version: 2, zones: {
      player: ['next', 'transport', 'progress'], actions: ['pin', 'settings'],
    } } }
    const migrated = getIslandLayout(base)
    expect(islandArrangement(migrated)).toBe('stacked')
    const edited = moveIslandElement(migrated, 'progress', 'player', 0)
    expect(getIslandLayout(withIslandLayout(base, edited))).toEqual(edited)
    expect(edited.zones.player).toEqual(['progress', 'next', 'transport'])
    expect(moveIslandElement(edited, 'settings', 'actions', 0).zones.actions).toEqual(['settings', 'pin'])
    expect(moveIslandElement(edited, 'transport', 'player', 0).zones.player).toEqual(['transport', 'progress', 'next'])
  })

  it('derives unsaved defaults from legacy flags and strict provider opt-ins', () => {
    const value = getLegacyIslandLayout(config())
    expect(value.zones).toEqual({
      left: ['codex'],
      player: ['previous', 'artwork', 'transport', 'next'],
      right: ['claude'],
      playerLower: ['dislike', 'like'],
      actions: ['settings', 'pin'],
      bottom: [],
    })
  })

  it('moves a provider between satellites instead of duplicating it', () => {
    const value = getLegacyIslandLayout(config())
    const moved = moveIslandElement(value, 'codex', 'right', 0)
    expect(moved.zones.left).toEqual([])
    expect(moved.zones.right).toEqual(['codex', 'claude'])
  })

  it('moves an enabled legacy server widget into the bottom zone and persists its removal', () => {
    const base = config()
    base.plugins.settings.ui = {
      localServersEnabled: true,
      islandLayout: { version: 2, zones: { player: ['transport'], actions: ['settings'] } },
    }
    const layout = getIslandLayout(base)
    expect(layout.zones.bottom).toEqual(['localServers'])
    expect(canPlaceIslandElement(layout, 'localServers', 'player')).toBe(false)
    expect(canPlaceIslandElement(layout, 'localServers', 'catalog')).toBe(false)
    const removed = moveIslandElement(layout, 'localServers', 'widgetCatalog')
    const saved = withIslandLayout(base, removed)
    expect(saved.plugins.settings.ui).toMatchObject({ localServersEnabled: false })
    expect(getIslandLayout(saved).zones.bottom).toEqual([])
    expect(moveIslandElement(removed, 'localServers', 'bottom').zones.bottom).toEqual(['localServers'])
  })

  it('never removes transport or settings', () => {
    const value = getLegacyIslandLayout(config())
    expect(removeIslandElement(value, 'transport')).toEqual(value)
    expect(removeIslandElement(value, 'settings')).toEqual(value)
  })

  it('lets transport, reactions and progress share either row, then collapses an emptied row', () => {
    let value = getLegacyIslandLayout(config())
    value = moveIslandElement(value, 'like', 'player', 0)
    expect(value.zones.player[0]).toBe('like')
    expect(value.zones.playerLower).toEqual(['dislike'])
    value = moveIslandElement(value, 'dislike', 'player')
    value = moveIslandElement(value, 'progress', 'player')
    expect(islandArrangement(value)).toBe('inline')
    expect(value.zones.player.at(-1)).toBe('progress')
    value = moveIslandElement(value, 'artwork', 'playerLower')
    value = moveIslandElement(value, 'like', 'playerLower', 0)
    value = moveIslandElement(value, 'repeat', 'playerLower', 1)
    expect(value.zones.playerLower).toEqual(['like', 'repeat', 'artwork', 'transport'])
    expect(value.zones.player).not.toContain('transport')
    expect(islandArrangement(value)).toBe('stacked')
    expect(getIslandLayout(withIslandLayout(config(), value))).toEqual(value)
  })

  it('restores an inline v3 layout with both reaction sides at the saved progress position', () => {
    const compact = normalizeIslandLayout({ version: 3, arrangement: 'inline', zones: {
      player: ['next', 'progress', 'transport'], reactionLeft: ['like', 'repeat'], reactionRight: ['dislike'],
    } })
    expect(compact.zones.player).toEqual(['next', 'like', 'repeat', 'progress', 'dislike', 'transport'])
    expect(compact.zones.playerLower).toEqual([])
    const moved = moveIslandElement(compact, 'like', 'playerLower')
    const restored = removeIslandElement(moved, 'like')
    expect(restored.zones.playerLower).toEqual([])
    expect(restored.zones.player).not.toContain('like')
  })

  it('rejects incompatible widget destinations and deduplicates controls across rows', () => {
    const value = normalizeIslandLayout({ version: 4, zones: {
      player: ['shuffle', 'like'], playerLower: ['shuffle', 'progress', 'like', 'repeat', 'repeat', 'settings'],
    } })
    expect(value.zones.playerLower).toEqual(['progress', 'repeat'])
    expect(canPlaceIslandElement(value, 'like', 'left')).toBe(false)
    expect(canPlaceIslandElement(value, 'shuffle', 'playerLower')).toBe(true)
    expect(zoneForIslandElement('like')).toBe('playerLower')
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
      player: ['previous', 'transport', 'next'], playerLower: ['dislike', 'like'],
    })
  })
})
