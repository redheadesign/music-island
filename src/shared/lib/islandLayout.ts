import type { AppConfig } from './types'

/** Compact action buttons are 32 CSS px wide with a 4 px gap. */
export function inlineActionsWidth(count: number): number {
  return count * 32 + Math.max(0, count - 1) * 4
}

export const ISLAND_LAYOUT_VERSION = 4 as const

export type IslandProviderElement = 'codex' | 'claude'
export type IslandPlayerElement = 'previous' | 'artwork' | 'transport' | 'next' | 'progress' | 'seekBack' | 'seekForward'
export type IslandArrangement = 'stacked' | 'inline'
export type IslandReactionElement = 'like' | 'dislike' | 'shuffle' | 'repeat'
export type IslandMusicElement = IslandPlayerElement | IslandReactionElement
export type IslandActionElement = 'settings' | 'pin' | 'microphone'
export type IslandBottomWidget = 'localServers'
export type IslandLayoutElement = IslandProviderElement | IslandPlayerElement | IslandReactionElement | IslandActionElement | IslandBottomWidget
export type IslandLayoutZone = 'left' | 'player' | 'right' | 'playerLower' | 'actions' | 'bottom'
export type IslandLayoutDropTarget = IslandLayoutZone | 'catalog' | 'widgetCatalog'

export interface IslandLayout {
  version: typeof ISLAND_LAYOUT_VERSION
  zones: {
    left: IslandProviderElement[]
    player: IslandMusicElement[]
    playerLower: IslandMusicElement[]
    right: IslandProviderElement[]
    actions: IslandActionElement[]
    bottom: IslandBottomWidget[]
  }
}

/** @deprecated Compatibility name while feature consumers migrate to IslandLayout. */
export type IslandLayoutV1 = IslandLayout

const PROVIDERS: readonly IslandProviderElement[] = ['codex', 'claude']
export const DEFAULT_ISLAND_PLAYER_ORDER: readonly IslandPlayerElement[] = ['previous', 'artwork', 'transport', 'next', 'progress']
const PLAYER_ELEMENTS: readonly IslandPlayerElement[] = [...DEFAULT_ISLAND_PLAYER_ORDER, 'seekBack', 'seekForward']
const REACTIONS: readonly IslandReactionElement[] = ['shuffle', 'dislike', 'like', 'repeat']
const MUSIC_ELEMENTS: readonly IslandMusicElement[] = [...PLAYER_ELEMENTS, ...REACTIONS]
const ACTIONS: readonly IslandActionElement[] = ['settings', 'pin', 'microphone']
const BOTTOM_WIDGETS: readonly IslandBottomWidget[] = ['localServers']

export function isIslandWidget(element: IslandLayoutElement): boolean {
  return element === 'localServers' || element === 'codex' || element === 'claude'
}

export function isIslandCatalog(target: IslandLayoutDropTarget): target is 'catalog' | 'widgetCatalog' {
  return target === 'catalog' || target === 'widgetCatalog'
}

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
  return DEFAULT_ISLAND_PLAYER_ORDER.filter((item) => requested.has(item))
}

/** Artwork includes the play/pause button. Keep its fallback in the same row. */
function normalizePlayerRows(top: unknown, lower: unknown) {
  let player = uniqueAllowed(top, MUSIC_ELEMENTS)
  let playerLower = uniqueAllowed(lower, MUSIC_ELEMENTS).filter(item => !player.includes(item))
  const artworkRow = [player, playerLower].find(row => row.includes('artwork'))
  if (artworkRow && !artworkRow.includes('transport')) {
    const other = artworkRow === player ? playerLower : player
    const index = other.indexOf('transport')
    if (index >= 0) other.splice(index, 1)
    artworkRow.splice(artworkRow.indexOf('artwork') + 1, 0, 'transport')
  } else if (!player.includes('transport') && !playerLower.includes('transport')) {
    player.push('transport')
  }
  // Moving the last control out of the top row collapses the empty space.
  if (!player.length) [player, playerLower] = [playerLower, []]
  return { player, playerLower }
}

/** v1–v3 stored reaction sides separately, even when all controls shared a row. */
function migratePlayerRows(zones: Record<string, unknown>, inline: boolean, v1: boolean) {
  const player = v1 ? migrateV1Player(zones.player) : uniqueAllowed(zones.player, PLAYER_ELEMENTS)
  if (!player.includes('transport')) player.push('transport')
  const left = uniqueAllowed(!v1 && Array.isArray(zones.reactionLeft) ? zones.reactionLeft : ['dislike'], REACTIONS)
  const right = uniqueAllowed(!v1 && Array.isArray(zones.reactionRight) ? zones.reactionRight : ['like'], REACTIONS)
    .filter(item => !left.includes(item))
  const strip: IslandMusicElement[] = [...left]
  if (player.includes('progress')) strip.push('progress')
  strip.push(...right)
  const controls = player.filter(item => item !== 'progress')
  if (!inline) return normalizePlayerRows(controls, strip)
  const slot = player.indexOf('progress')
  const merged: IslandMusicElement[] = [...controls]
  merged.splice(slot < 0 ? merged.length : slot, 0, ...strip)
  return normalizePlayerRows(merged, [])
}

export function islandArrangement(layout: IslandLayout): IslandArrangement {
  return layout.zones.playerLower.length ? 'stacked' : 'inline'
}

export function normalizeIslandLayout(value: unknown): IslandLayout {
  const root = isRecord(value) ? value : {}
  const zones = isRecord(root.zones) ? root.zones : {}
  const left = uniqueAllowed(zones.left, PROVIDERS).slice(0, 2)
  const providers = new Set(left)
  const right = uniqueAllowed(zones.right, PROVIDERS).filter((item) => !providers.has(item)).slice(0, 2 - left.length)

  const rows = root.version === ISLAND_LAYOUT_VERSION
    ? normalizePlayerRows(zones.player, zones.playerLower)
    : migratePlayerRows(zones, root.version === 3 && root.arrangement === 'inline', root.version === 1)

  const actions = uniqueAllowed(zones.actions, ACTIONS)
  if (!actions.includes('settings')) actions.unshift('settings')

  const bottom = uniqueAllowed(zones.bottom, BOTTOM_WIDGETS)
  return { version: ISLAND_LAYOUT_VERSION, zones: { left, ...rows, right, actions, bottom } }
}

/** Before rows were editable, buttons-only density overrode the saved controls.
 * Migrate what the player actually displayed so hidden items return to the tray. */
function applyLegacyDensity(config: AppConfig, layout: IslandLayout): IslandLayout {
  if (config.layout.density !== 'buttons-only') return layout
  const visible = (element: IslandMusicElement) =>
    element === 'transport' || element === 'seekBack' || element === 'seekForward' || ((element === 'previous' || element === 'next') && config.layout.showPreviousNext)
  const rows = normalizePlayerRows(layout.zones.player.filter(visible), layout.zones.playerLower.filter(visible))
  return { ...layout, zones: { ...layout.zones, ...rows } }
}

export function getLegacyIslandLayout(config: AppConfig): IslandLayout {
  const usage = isRecord(config.plugins?.settings?.usage) ? config.plugins.settings.usage : {}
  const player: IslandPlayerElement[] = []
  if (config.layout.showPreviousNext) player.push('previous')
  if (config.layout.showArtwork) player.push('artwork')
  player.push('transport')
  if (config.layout.showPreviousNext) player.push('next')
  if (config.layout.showProgress) player.push('progress')
  return applyLegacyDensity(config, normalizeIslandLayout({ version: 3, zones: {
    left: usage.codexEnabled === true ? ['codex'] : [], player,
    right: usage.claudeEnabled === true ? ['claude'] : [],
    reactionLeft: ['dislike'], reactionRight: ['like'], actions: ['settings', 'pin'],
  } }))
}

export function getIslandLayout(config: AppConfig): IslandLayout {
  const ui = config.plugins?.settings?.ui
  const raw = isRecord(ui) ? ui.islandLayout : undefined
  const saved = isRecord(raw) && (raw.version === 1 || raw.version === 2 || raw.version === 3 || raw.version === ISLAND_LAYOUT_VERSION) ? raw : undefined
  const layout = saved ? normalizeIslandLayout(saved) : getLegacyIslandLayout(config)
  const hasBottomZone = isRecord(saved?.zones) && Array.isArray(saved.zones.bottom)
  if (!hasBottomZone && isRecord(ui) && ui.localServersEnabled === true) layout.zones.bottom = ['localServers']
  return saved && saved.version !== ISLAND_LAYOUT_VERSION ? applyLegacyDensity(config, layout) : layout
}

export function withIslandLayout(config: AppConfig, layout: IslandLayout): AppConfig {
  const currentUi = isRecord(config.plugins.settings.ui) ? config.plugins.settings.ui : {}
  const normalized = normalizeIslandLayout(layout)
  const controls = [...normalized.zones.player, ...normalized.zones.playerLower]
  return {
    ...config,
    layout: { ...config.layout,
      showArtwork: controls.includes('artwork'),
      showPreviousNext: controls.includes('previous') || controls.includes('next'),
      showProgress: controls.includes('progress'),
    },
    behavior: { ...config.behavior, pinExpanded: normalized.zones.actions.includes('pin') ? config.behavior.pinExpanded : false },
    plugins: { ...config.plugins, settings: { ...config.plugins.settings, ui: {
      ...currentUi, islandLayout: normalized,
      // The native discovery commands and older portable builds read this flag.
      localServersEnabled: normalized.zones.bottom.includes('localServers'),
    } } },
  }
}

export function zoneForIslandElement(element: IslandLayoutElement): IslandLayoutZone {
  if (element === 'localServers') return 'bottom'
  if (PROVIDERS.includes(element as IslandProviderElement)) return element === 'codex' ? 'left' : 'right'
  if (PLAYER_ELEMENTS.includes(element as IslandPlayerElement)) return 'player'
  if (REACTIONS.includes(element as IslandReactionElement)) return 'playerLower'
  return 'actions'
}

function accepts(zone: IslandLayoutZone, element: IslandLayoutElement): boolean {
  if (zone === 'bottom') return element === 'localServers'
  if (zone === 'left' || zone === 'right') return PROVIDERS.includes(element as IslandProviderElement)
  if (zone === 'player' || zone === 'playerLower') return MUSIC_ELEMENTS.includes(element as IslandMusicElement)
  return ACTIONS.includes(element as IslandActionElement)
}

export function canPlaceIslandElement(layout: IslandLayout, element: IslandLayoutElement, target: IslandLayoutDropTarget): boolean {
  if (target === 'widgetCatalog') return isIslandWidget(element)
  if (target === 'catalog') return !isIslandWidget(element) && element !== 'transport' && element !== 'settings'
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
    playerLower: layout.zones.playerLower.filter((item) => item !== element),
    actions: layout.zones.actions.filter((item) => item !== element),
    bottom: layout.zones.bottom.filter((item) => item !== element),
  } })
}

export function moveIslandElement(layout: IslandLayout, element: IslandLayoutElement, target: IslandLayoutDropTarget, index?: number): IslandLayout {
  const current = normalizeIslandLayout(layout)
  if (!canPlaceIslandElement(current, element, target)) return current
  if (isIslandCatalog(target)) return removeIslandElement(current, element)

  const zones = Object.fromEntries(Object.entries(current.zones).map(([zone, items]) =>
    [zone, (items as IslandLayoutElement[]).filter((item) => item !== element)]
  )) as IslandLayout['zones']
  const values = zones[target] as IslandLayoutElement[]
  values.splice(Math.max(0, Math.min(index ?? values.length, values.length)), 0, element)
  return normalizeIslandLayout({ ...current, zones })
}

export const ISLAND_LAYOUT_ELEMENTS = {
  providers: PROVIDERS, player: PLAYER_ELEMENTS, reactions: REACTIONS, actions: ACTIONS, bottom: BOTTOM_WIDGETS,
} as const
