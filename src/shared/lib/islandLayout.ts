import type { AppConfig } from './types'

export const ISLAND_LAYOUT_VERSION = 2 as const

export type IslandProviderElement = 'codex' | 'claude'
export type IslandPlayerElement = 'previous' | 'artwork' | 'transport' | 'next' | 'progress'
export type IslandReactionElement = 'like' | 'dislike' | 'shuffle' | 'repeat'
export type IslandActionElement = 'settings' | 'pin' | 'microphone'
export type IslandLayoutElement = IslandProviderElement | IslandPlayerElement | IslandReactionElement | IslandActionElement
export type IslandLayoutZone = 'left' | 'player' | 'right' | 'reactionLeft' | 'reactionRight' | 'actions'
export type IslandLayoutDropTarget = IslandLayoutZone | 'catalog'

export interface IslandLayout {
  version: typeof ISLAND_LAYOUT_VERSION
  zones: {
    left: IslandProviderElement[]
    player: IslandPlayerElement[]
    right: IslandProviderElement[]
    reactionLeft: IslandReactionElement[]
    reactionRight: IslandReactionElement[]
    actions: IslandActionElement[]
  }
}

/** @deprecated Compatibility name while feature consumers migrate to IslandLayout. */
export type IslandLayoutV1 = IslandLayout

const PROVIDERS: readonly IslandProviderElement[] = ['codex', 'claude']
const PLAYER_DEFAULT_ORDER: readonly IslandPlayerElement[] = ['previous', 'artwork', 'transport', 'next', 'progress']
const REACTIONS: readonly IslandReactionElement[] = ['shuffle', 'dislike', 'like', 'repeat']
const ACTIONS: readonly IslandActionElement[] = ['settings', 'pin', 'microphone']

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function uniqueAllowed<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  const seen = new Set<T>()
  return (Array.isArray(value) ? value : []).filter((item): item is T => {
    if (typeof item !== 'string' || !allowed.includes(item as T) || seen.has(item as T)) return false
    seen.add(item as T)
    return true
  })
}

function migrateV1Player(value: unknown): IslandPlayerElement[] {
  const old = uniqueAllowed(value, ['artwork', 'navigation', 'transport', 'progress'] as const)
  const requested = new Set<IslandPlayerElement>()
  if (old.includes('navigation')) { requested.add('previous'); requested.add('next') }
  if (old.includes('artwork')) requested.add('artwork')
  if (old.includes('progress')) requested.add('progress')
  requested.add('transport')
  return PLAYER_DEFAULT_ORDER.filter((item) => requested.has(item))
}

export function normalizeIslandLayout(value: unknown): IslandLayout {
  const root = isRecord(value) ? value : {}
  const zones = isRecord(root.zones) ? root.zones : {}
  const isV1 = root.version === 1
  const left = uniqueAllowed(zones.left, PROVIDERS).slice(0, 2)
  const providers = new Set(left)
  const right = uniqueAllowed(zones.right, PROVIDERS).filter((item) => !providers.has(item)).slice(0, 2 - left.length)

  const player = isV1 ? migrateV1Player(zones.player) : uniqueAllowed(zones.player, PLAYER_DEFAULT_ORDER)
  if (!player.includes('transport')) player.push('transport')

  const leftSource = Array.isArray(zones.reactionLeft) && !isV1 ? zones.reactionLeft : ['dislike']
  const rightSource = Array.isArray(zones.reactionRight) && !isV1 ? zones.reactionRight : ['like']
  const reactionLeft = uniqueAllowed(leftSource, REACTIONS)
  const reactions = new Set(reactionLeft)
  const reactionRight = uniqueAllowed(rightSource, REACTIONS).filter((item) => !reactions.has(item))

  const actions = uniqueAllowed(zones.actions, ACTIONS)
  if (!actions.includes('settings')) actions.unshift('settings')

  return { version: ISLAND_LAYOUT_VERSION, zones: { left, player, right, reactionLeft, reactionRight, actions } }
}

export function getLegacyIslandLayout(config: AppConfig): IslandLayout {
  const usage = isRecord(config.plugins?.settings?.usage) ? config.plugins.settings.usage : {}
  const player: IslandPlayerElement[] = []
  if (config.layout.showPreviousNext) player.push('previous')
  if (config.layout.showArtwork) player.push('artwork')
  player.push('transport')
  if (config.layout.showPreviousNext) player.push('next')
  if (config.layout.showProgress) player.push('progress')
  return normalizeIslandLayout({ version: ISLAND_LAYOUT_VERSION, zones: {
    left: usage.codexEnabled === true ? ['codex'] : [], player,
    right: usage.claudeEnabled === true ? ['claude'] : [],
    reactionLeft: ['dislike'], reactionRight: ['like'], actions: ['settings', 'pin'],
  } })
}

export function getIslandLayout(config: AppConfig): IslandLayout {
  const ui = config.plugins?.settings?.ui
  const raw = isRecord(ui) ? ui.islandLayout : undefined
  if (!isRecord(raw)) return getLegacyIslandLayout(config)
  if (raw.version === 1 || raw.version === ISLAND_LAYOUT_VERSION) return normalizeIslandLayout(raw)
  return getLegacyIslandLayout(config)
}

export function withIslandLayout(config: AppConfig, layout: IslandLayout): AppConfig {
  const currentUi = isRecord(config.plugins.settings.ui) ? config.plugins.settings.ui : {}
  const normalized = normalizeIslandLayout(layout)
  return {
    ...config,
    layout: { ...config.layout,
      showArtwork: normalized.zones.player.includes('artwork'),
      showPreviousNext: normalized.zones.player.includes('previous') || normalized.zones.player.includes('next'),
      showProgress: normalized.zones.player.includes('progress'),
    },
    behavior: { ...config.behavior, pinExpanded: normalized.zones.actions.includes('pin') ? config.behavior.pinExpanded : false },
    plugins: { ...config.plugins, settings: { ...config.plugins.settings, ui: { ...currentUi, islandLayout: normalized } } },
  }
}

export function zoneForIslandElement(element: IslandLayoutElement): IslandLayoutZone {
  if (PROVIDERS.includes(element as IslandProviderElement)) return element === 'codex' ? 'left' : 'right'
  if (PLAYER_DEFAULT_ORDER.includes(element as IslandPlayerElement)) return 'player'
  if (REACTIONS.includes(element as IslandReactionElement)) return element === 'dislike' || element === 'shuffle' ? 'reactionLeft' : 'reactionRight'
  return 'actions'
}

function accepts(zone: IslandLayoutZone, element: IslandLayoutElement): boolean {
  if (zone === 'left' || zone === 'right') return PROVIDERS.includes(element as IslandProviderElement)
  if (zone === 'player') return PLAYER_DEFAULT_ORDER.includes(element as IslandPlayerElement)
  if (zone === 'reactionLeft' || zone === 'reactionRight') return REACTIONS.includes(element as IslandReactionElement)
  return ACTIONS.includes(element as IslandActionElement)
}

export function canPlaceIslandElement(layout: IslandLayout, element: IslandLayoutElement, target: IslandLayoutDropTarget): boolean {
  if (target === 'catalog') return element !== 'transport' && element !== 'settings'
  if (!accepts(target, element)) return false
  if (target === 'left' || target === 'right') {
    const other = target === 'left' ? layout.zones.right : layout.zones.left
    const here = layout.zones[target].includes(element as IslandProviderElement)
    return here || other.includes(element as IslandProviderElement) || layout.zones.left.length + layout.zones.right.length < 2
  }
  return true
}

export function removeIslandElement(layout: IslandLayout, element: IslandLayoutElement): IslandLayout {
  if (element === 'transport' || element === 'settings') return normalizeIslandLayout(layout)
  return normalizeIslandLayout({ ...layout, zones: {
    left: layout.zones.left.filter((item) => item !== element),
    player: layout.zones.player.filter((item) => item !== element),
    right: layout.zones.right.filter((item) => item !== element),
    reactionLeft: layout.zones.reactionLeft.filter((item) => item !== element),
    reactionRight: layout.zones.reactionRight.filter((item) => item !== element),
    actions: layout.zones.actions.filter((item) => item !== element),
  } })
}

export function moveIslandElement(layout: IslandLayout, element: IslandLayoutElement, target: IslandLayoutDropTarget, index?: number): IslandLayout {
  const current = normalizeIslandLayout(layout)
  if (!canPlaceIslandElement(current, element, target)) return current
  if (target === 'catalog') return removeIslandElement(current, element)

  const without = removeIslandElement(current, element)
  const zones = {
    left: [...without.zones.left], player: [...without.zones.player], right: [...without.zones.right],
    reactionLeft: [...without.zones.reactionLeft], reactionRight: [...without.zones.reactionRight], actions: [...without.zones.actions],
  }
  const values = zones[target] as IslandLayoutElement[]
  values.splice(Math.max(0, Math.min(index ?? values.length, values.length)), 0, element)
  return normalizeIslandLayout({ ...without, zones })
}

export const ISLAND_LAYOUT_ELEMENTS = {
  providers: PROVIDERS, player: PLAYER_DEFAULT_ORDER, reactions: REACTIONS, actions: ACTIONS,
} as const
