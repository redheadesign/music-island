/** @vitest-environment happy-dom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { IslandLayout, IslandPlayerElement, IslandReactionElement } from '../../shared/lib/islandLayout'
import type { MediaSnapshot } from '../../shared/lib/types'
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

function v2Layout(
  player: IslandPlayerElement[],
  reactionLeft: IslandReactionElement[] = ['dislike'],
  reactionRight: IslandReactionElement[] = ['like'],
): IslandLayout {
  return {
    version: 2,
    zones: { left: [], player, right: [], reactionLeft, reactionRight, actions: ['settings'] },
  }
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
    expect(html).toMatch(/<button[^>]*aria-label="Seek track"[^>]*disabled=""/)
    expect(html).toContain('--progress:0.625')
  })

  it('does not render seek controls for an absent or unavailable session', () => {
    expect(renderPlayer({ media: null })).not.toContain('aria-label="Seek track"')
    expect(renderPlayer({ media: { ...snapshot, smtcHealth: 'unavailable' } })).not.toContain('aria-label="Seek track"')
  })

  it('hides SMTC progress when the layout disables it', () => {
    expect(renderPlayer({ showProgress: false })).not.toContain('aria-label="Seek track"')
  })

  it('hides Direct progress when the layout disables it', () => {
    expect(renderPlayer({
      media: { ...snapshot, provider: 'yandex-direct' },
      showProgress: false,
    })).not.toContain('aria-label="Seek track"')
  })
})

describe('MusicModule V2 layout behavior', () => {
  it('renders previous and next independently while keeping protected playback without artwork', () => {
    const previousOnly = renderPlayer({
      layout: v2Layout(['previous', 'transport', 'progress']),
      showArtwork: false,
    })
    expect(previousOnly).toContain('aria-label="Previous"')
    expect(previousOnly).not.toContain('aria-label="Next"')
    expect(previousOnly).toContain('aria-label="Pause"')
    expect(previousOnly).not.toContain('artwork-shell')

    const nextOnly = renderPlayer({
      layout: v2Layout(['transport', 'next', 'progress']),
      showArtwork: false,
    })
    expect(nextOnly).not.toContain('aria-label="Previous"')
    expect(nextOnly).toContain('aria-label="Next"')
    expect(nextOnly).toContain('aria-label="Pause"')
  })

  it('renders like and dislike together on one side and leaves a removed side empty', () => {
    const renderZone: NonNullable<ComponentProps<typeof MusicModule>['renderZone']> = (zone, node) => (
      <div data-zone={zone}>{node}</div>
    )
    const direct = { ...snapshot, provider: 'yandex-direct' as const, canLike: true, canDislike: true }
    const together = document.createElement('div')
    together.innerHTML = renderPlayer({
      media: direct,
      layout: v2Layout(['artwork', 'transport', 'progress'], ['like', 'dislike'], []),
      renderZone,
    })
    const sameSideButtons = together.querySelectorAll('[data-zone="reactionLeft"] button')
    expect(sameSideButtons).toHaveLength(2)
    expect([...sameSideButtons].map((button) => button.getAttribute('aria-label'))).toEqual(['Добавить в любимое', 'Не нравится'])
    expect(together.querySelector('[data-zone="reactionRight"] button')).toBeNull()

    const removed = document.createElement('div')
    removed.innerHTML = renderPlayer({
      media: direct,
      layout: v2Layout(['artwork', 'transport', 'progress'], ['dislike'], []),
      renderZone,
    })
    expect(removed.querySelector('[data-zone="reactionLeft"] [aria-label="Добавить в любимое"]')).toBeNull()
    expect(removed.querySelector('[data-zone="reactionLeft"] [aria-label="Не нравится"]')).not.toBeNull()
    expect(removed.querySelector('[data-zone="reactionRight"] button')).toBeNull()
  })

  it('routes navigation, protected playback, and reaction commands unchanged', async () => {
    const onCommand = vi.fn()
    const mounted = await mountPlayer({
      media: { ...snapshot, provider: 'yandex-direct', canLike: true, canDislike: true },
      layout: v2Layout(['previous', 'transport', 'next', 'progress'], ['like'], ['dislike']),
      showArtwork: false,
      onCommand,
    })
    try {
      for (const label of ['Previous', 'Pause', 'Next', 'Добавить в любимое', 'Не нравится']) {
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
      layout: v2Layout(['transport', 'progress'], ['shuffle', 'repeat'], []),
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

  it('still emits one authoritative seek command for one pointer gesture', async () => {
    const onCommand = vi.fn()
    const mounted = await mountPlayer({ onCommand })
    try {
      const seek = mounted.container.querySelector<HTMLButtonElement>('button[aria-label="Seek track"]')!
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
