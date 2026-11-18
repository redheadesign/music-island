/** @vitest-environment happy-dom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { getIslandLayout, moveIslandElement, normalizeIslandLayout, withIslandLayout, type IslandLayout, type IslandPlayerElement, type IslandReactionElement } from '../../shared/lib/islandLayout'
import type { MediaSnapshot } from '../../shared/lib/types'
import { getDefaultConfig } from '../../app/tauriApi'
import { MusicModule } from './MusicModule'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const snapshot: MediaSnapshot = {
  hasSession: true, sourceAppId: 'fixture-player', trackId: 'track-a',
  title: 'Track A', artist: 'Artist A', albumTitle: null,
  playbackStatus: 'playing', positionMs: 75_000, durationMs: 120_000,
  canSeek: true, canGoNext: true, canGoPrevious: true, canPlay: true, canPause: true,
  canLike: false, canDislike: false, isLiked: false, isDisliked: false,
  canShuffle: false, isShuffleActive: false, canRepeat: false, repeatMode: 'off',
  activeWaveId: null, activeWaveTitle: null, thumbnailDataUrl: null,
  updatedAt: '2026-09-08T12:00:00Z', provider: 'smtc', smtcHealth: 'healthy',
}

function renderPlayer(overrides: Partial<ComponentProps<typeof MusicModule>> = {}) {
  return renderToStaticMarkup(<MusicModule
    media={snapshot} progressMs={75_000} progressPercent={62.5}
    density="balanced" showArtwork showTitle showArtist showProgress showSource={false}
    showPreviousNext onCommand={vi.fn()} {...overrides}
  />)
}

function islandLayout(
  player: IslandPlayerElement[],
  reactionLeft: IslandReactionElement[] = ['dislike'],
  reactionRight: IslandReactionElement[] = ['like'],
): IslandLayout {
  return normalizeIslandLayout({ version: 3, zones: { player, reactionLeft, reactionRight, actions: ['settings'] } })
}

async function mountPlayer(overrides: Partial<ComponentProps<typeof MusicModule>> = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<MusicModule
      media={snapshot} progressMs={75_000} progressPercent={62.5}
      density="balanced" showArtwork showTitle showArtist showProgress showSource={false}
      showPreviousNext onCommand={vi.fn()} {...overrides}
    />)
  })
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
    },
  }
}

describe('MusicModule progress characterization', () => {
  it('renders the supplied authoritative progress without resetting it', () => {
    const html = renderPlayer()
    expect(html).toContain('--progress:0.625')
    expect(html).toContain('1:15 / 2:00')
    expect(html).toContain('Artist A · Track A')
  })

  it('accepts a different track position without deriving a seek or command', () => {
    const onCommand = vi.fn()
    const html = renderPlayer({ media: { ...snapshot, trackId: 'track-b', title: 'Track B' }, progressMs: 18_000, progressPercent: 15, onCommand })
    expect(html).toContain('--progress:0.15')
    expect(html).toContain('0:18 / 2:00')
    expect(onCommand).not.toHaveBeenCalled()
  })

  it('keeps the progress button governed by canSeek', () => {
    const html = renderPlayer({ media: { ...snapshot, canSeek: false } })
    expect(html).toMatch(/<button[^>]*aria-label="Позиция трека"[^>]*disabled=""/)
    expect(html).toContain('--progress:0.625')
  })

  it('does not render seek controls for an absent or unavailable session', () => {
    expect(renderPlayer({ media: null })).not.toContain('aria-label="Позиция трека"')
    expect(renderPlayer({ media: { ...snapshot, smtcHealth: 'unavailable' } })).not.toContain('aria-label="Позиция трека"')
  })

  it('hides SMTC progress when the layout disables it', () => {
    expect(renderPlayer({ showProgress: false })).not.toContain('aria-label="Позиция трека"')
  })

  it('hides Direct progress when the layout disables it', () => {
    expect(renderPlayer({
      media: { ...snapshot, provider: 'yandex-direct' },
      showProgress: false,
    })).not.toContain('aria-label="Позиция трека"')
  })
})

describe('MusicModule saved layout behavior', () => {
  it('restores an edited buttons-only profile with exactly the controls added to its rows', () => {
    const base = getDefaultConfig()
    const v3 = { version: 3, arrangement: 'stacked', zones: {
      player: ['artwork', 'transport', 'next', 'progress'], reactionLeft: ['dislike'], reactionRight: ['like'],
    } }
    const legacy = {
      ...base,
      layout: { ...base.layout, density: 'buttons-only' as const, showArtwork: true, showProgress: true, showPreviousNext: true },
      plugins: { ...base.plugins, settings: { ...base.plugins.settings, ui: { islandLayout: v3 } } },
    }
    const restored = (config: typeof base) => {
      const container = document.createElement('div')
      container.innerHTML = renderPlayer({ density: config.layout.density, layout: getIslandLayout(config),
        showProgress: config.layout.showProgress, showArtwork: config.layout.showArtwork,
        renderElement: (id, node) => <div data-control={id}>{node}</div> })
      return Array.from(container.querySelectorAll('[data-control]'), el => el.getAttribute('data-control'))
    }
    expect(restored(legacy)).toEqual(['transport', 'next'])
    expect(restored({ ...legacy, layout: { ...legacy.layout, showPreviousNext: false } })).toEqual(['transport'])
    let edited = withIslandLayout(legacy, moveIslandElement(getIslandLayout(legacy), 'progress', 'playerLower'))
    expect(restored(JSON.parse(JSON.stringify(edited)))).toEqual(['transport', 'next', 'progress'])
    for (const id of ['like', 'artwork'] as const) {
      edited = withIslandLayout(edited, moveIslandElement(getIslandLayout(edited), id, 'playerLower'))
    }
    expect(restored(JSON.parse(JSON.stringify(edited)))).toEqual(['next', 'progress', 'like', 'artwork'])
  })

  it('renders previous and next independently while keeping protected playback without artwork', () => {
    const previousOnly = renderPlayer({
      layout: islandLayout(['previous', 'transport', 'progress']),
      showArtwork: false,
    })
    expect(previousOnly).toContain('aria-label="Предыдущий трек"')
    expect(previousOnly).not.toContain('aria-label="Следующий трек"')
    expect(previousOnly).toContain('aria-label="Пауза"')
    expect(previousOnly).not.toContain('artwork-shell')

    const nextOnly = renderPlayer({
      layout: islandLayout(['transport', 'next', 'progress']),
      showArtwork: false,
    })
    expect(nextOnly).not.toContain('aria-label="Предыдущий трек"')
    expect(nextOnly).toContain('aria-label="Следующий трек"')
    expect(nextOnly).toContain('aria-label="Пауза"')
  })

  it('renders like and dislike together on one side and leaves a removed side empty', () => {
    const renderZone: NonNullable<ComponentProps<typeof MusicModule>['renderZone']> = (zone, node) => (
      <div data-zone={zone}>{node}</div>
    )
    const direct = { ...snapshot, provider: 'yandex-direct' as const, canLike: true, canDislike: true }
    const together = document.createElement('div')
    together.innerHTML = renderPlayer({
      media: direct,
      layout: islandLayout(['artwork', 'transport', 'progress'], ['like', 'dislike'], []),
      renderZone,
    })
    const sameSideButtons = together.querySelectorAll('[data-zone="playerLower"] button')
    expect(sameSideButtons).toHaveLength(3)
    expect([...sameSideButtons].map((button) => button.getAttribute('aria-label'))).toEqual(['Добавить в любимое', 'Не нравится', 'Позиция трека'])

    const removed = document.createElement('div')
    removed.innerHTML = renderPlayer({
      media: direct,
      layout: islandLayout(['artwork', 'transport', 'progress'], ['dislike'], []),
      renderZone,
    })
    expect(removed.querySelector('[data-zone="playerLower"] [aria-label="Добавить в любимое"]')).toBeNull()
    expect(removed.querySelector('[data-zone="playerLower"] [aria-label="Не нравится"]')).not.toBeNull()
  })

  it('routes navigation, protected playback, and reaction commands unchanged', async () => {
    const onCommand = vi.fn()
    const mounted = await mountPlayer({
      media: { ...snapshot, provider: 'yandex-direct', canLike: true, canDislike: true },
      layout: islandLayout(['previous', 'transport', 'next', 'progress'], ['like'], ['dislike']),
      showArtwork: false,
      onCommand,
    })
    try {
      for (const label of ['Предыдущий трек', 'Пауза', 'Следующий трек', 'Добавить в любимое', 'Не нравится']) {
        const button = mounted.container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
        expect(button, label).not.toBeNull()
        await act(async () => button!.click())
      }
      expect(onCommand.mock.calls.map(([command]) => command)).toEqual([
        'previous', 'play-pause', 'next', 'like', 'dislike',
      ])
    } finally {
      await mounted.unmount()
    }
  })

  it('renders optional shuffle and repeat together and routes their commands', async () => {
    const onCommand = vi.fn()
    const mounted = await mountPlayer({
      media: { ...snapshot, canShuffle: true, isShuffleActive: true, canRepeat: true, repeatMode: 'one' },
      layout: islandLayout(['transport', 'progress'], ['shuffle', 'repeat'], []),
      showArtwork: false,
      onCommand,
    })
    try {
      const shuffle = mounted.container.querySelector<HTMLButtonElement>('button[aria-label="Перемешать"]')
      const repeat = mounted.container.querySelector<HTMLButtonElement>('button[aria-label="Повтор трека"]')
      expect(shuffle).not.toBeNull()
      expect(repeat).not.toBeNull()
      expect(shuffle?.getAttribute('aria-pressed')).toBe('true')
      expect(repeat?.getAttribute('aria-pressed')).toBe('true')
      await act(async () => shuffle!.click())
      await act(async () => repeat!.click())
      expect(onCommand.mock.calls.map(([command]) => command)).toEqual(['toggle-shuffle', 'cycle-repeat'])
    } finally {
      await mounted.unmount()
    }
  })

  it('renders inline progress at its saved position using the same production controls', () => {
    for (const order of [['progress', 'transport', 'next'], ['next', 'transport', 'progress']] as const) {
      const root = document.createElement('div')
      const layout = normalizeIslandLayout({ version: 4, zones: { player: order } })
      root.innerHTML = renderPlayer({ layout, showArtwork: false, renderElement: (id, node) => node && <div data-control={id}>{node}</div> })
      expect([...root.querySelectorAll('.media-controls [data-control]')].map(node => node.getAttribute('data-control'))).toEqual(order)
      expect(root.querySelectorAll('[role="slider"]')).toHaveLength(1)
    }
  })

  it('clamps optional ten-second jumps to the track and honors seek capability', async () => {
    const onCommand = vi.fn()
    const layout = islandLayout(['seekBack', 'transport', 'seekForward'], [], [])
    const mounted = await mountPlayer({ layout, progressMs: 4000, media: { ...snapshot, durationMs: 9000 }, onCommand })
    try {
      for (const label of ['Назад на 10 секунд', 'Вперёд на 10 секунд']) {
        await act(async () => mounted.container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click())
      }
      expect(onCommand.mock.calls.map(([command]) => command)).toEqual([{ seek: { positionMs: 0 } }, { seek: { positionMs: 9000 } }])
      const html = renderPlayer({ layout, media: { ...snapshot, canSeek: false } })
      expect(html).toMatch(/<button[^>]*aria-label="Назад на 10 секунд"[^>]*disabled/)
    } finally { await mounted.unmount() }
  })

  it('describes time and seeks by keyboard in the selected language', async () => {
    const onCommand = vi.fn()
    const mounted = await mountPlayer({ locale: 'en', onCommand })
    try {
      const slider = mounted.container.querySelector<HTMLElement>('[role="slider"]')!
      expect(slider.getAttribute('aria-label')).toBe('Seek track')
      expect(slider.getAttribute('aria-valuetext')).toBe('1:15 of 2:00')
      for (const key of ['ArrowRight', 'Home', 'End', 'Tab']) {
        await act(async () => { slider.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })) })
      }
      expect(onCommand.mock.calls.map(([command]) => command)).toEqual([
        { seek: { positionMs: 80_000 } }, { seek: { positionMs: 0 } }, { seek: { positionMs: 120_000 } },
      ])
    } finally {
      await mounted.unmount()
    }
  })

  it('still emits one authoritative seek command for one pointer gesture', async () => {
    const onCommand = vi.fn()
    const mounted = await mountPlayer({ onCommand })
    try {
      const seek = mounted.container.querySelector<HTMLButtonElement>('button[aria-label="Позиция трека"]')!
      const captured = new Set<number>()
      Object.defineProperties(seek, {
        getBoundingClientRect: {
          configurable: true,
          value: () => ({ left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
        },
        setPointerCapture: { configurable: true, value: (id: number) => captured.add(id) },
        hasPointerCapture: { configurable: true, value: (id: number) => captured.has(id) },
        releasePointerCapture: { configurable: true, value: (id: number) => captured.delete(id) },
      })
      await act(async () => {
        seek.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 40, pointerId: 7 }))
        seek.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 150, pointerId: 7 }))
        seek.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 150, pointerId: 7 }))
        seek.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 180, pointerId: 7 }))
      })
      expect(onCommand).toHaveBeenCalledTimes(1)
      expect(onCommand).toHaveBeenCalledWith({ seek: { positionMs: 90_000 } })
    } finally {
      await mounted.unmount()
    }
  })
})
