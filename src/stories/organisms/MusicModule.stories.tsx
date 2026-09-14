import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import { useArgs } from 'storybook/preview-api'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { MusicModule } from '../../features/music/MusicModule'
import { media } from '../fixtures'

type PlayerArgs = ComponentProps<typeof MusicModule> & {
  trackTitle: string
  trackArtist: string
}

const transitionTracks = [
  { id: 'transition-a', title: 'Тёплый вечер' },
  { id: 'transition-b', title: 'Вдоль ночных улиц' },
  { id: 'transition-c', title: 'Первый свет' },
]

function TrackTransitionPreview({ args, locale }: { args: PlayerArgs; locale: ComponentProps<typeof MusicModule>['locale'] }) {
  const [index, setIndex] = useState(0)
  const [position, setPosition] = useState(args.progressMs ?? 73_000)
  useEffect(() => setPosition(args.progressMs ?? 73_000), [args.progressMs])
  const source = args.media ?? media
  return <div className="sample-music"><MusicModule {...args}
    locale={locale}
    media={{ ...source, trackId: transitionTracks[index].id, title: transitionTracks[index].title }}
    progressMs={position} progressPercent={position / (source.durationMs || 1) * 100}
    onCommand={(command) => {
      args.onCommand(command)
      if (command === 'next' || command === 'previous') {
        setIndex((current) => (current + (command === 'next' ? 1 : -1) + transitionTracks.length) % transitionTracks.length)
        setPosition(0)
      } else if (typeof command === 'object' && 'seek' in command) setPosition(command.seek.positionMs)
    }} /></div>
}

function trackTransitionRender(args: PlayerArgs, context: { globals: Record<string, unknown> }) {
  return <TrackTransitionPreview args={args} locale={context.globals.locale === 'en' ? 'en' : 'ru'} />
}

const meta = {
  title: 'Organisms/MusicModule',
  component: MusicModule,
  tags: ['autodocs'],
  args: {
    media,
    trackTitle: 'Тёплый вечер',
    trackArtist: 'Music Island Ensemble',
    progressMs: 73000,
    progressPercent: 34,
    density: 'balanced',
    showArtwork: true,
    showTitle: true,
    showArtist: true,
    showProgress: true,
    showSource: true,
    showPreviousNext: true,
    onCommand: fn().mockName('music.command'),
    onDirectReload: fn().mockName('music.reconnect'),
  },
  argTypes: {
    trackTitle: { name: 'Название трека', control: 'text' },
    trackArtist: { name: 'Исполнитель', control: 'text' },
    media: { table: { disable: true } },
    progressMs: { table: { disable: true } },
    density: {
      name: 'Плотность',
      control: 'inline-radio',
      options: ['buttons-only', 'minimal', 'balanced', 'rich'],
    },
    progressPercent: {
      name: 'Прогресс, %',
      control: { type: 'range', min: 0, max: 100 },
    },
    showArtwork: { name: 'Обложка' },
    showTitle: { name: 'Название' },
    showArtist: { name: 'Исполнитель в плеере' },
    showProgress: { name: 'Прогресс' },
    showPreviousNext: { name: 'Переключение треков' },
    showSource: { name: 'Источник' },
    locale: { table: { disable: true } },
  },
  parameters: {
    workshop: {
      width: 480,
      note: 'Настоящий плеер с демонстрационным треком. Воспроизведение, лайк и перемотка меняют только этот пример.',
    },
  },
  render: function Player(args, context) {
    const [, updateArgs] = useArgs()
    return (
      <div className="sample-music">
        <MusicModule
          {...args}
          media={
            args.media
              ? {
                  ...args.media,
                  title: args.trackTitle,
                  artist: args.trackArtist,
                }
              : null
          }
          progressMs={
            args.media
              ? Math.round(
                  ((args.media.durationMs ?? 0) * args.progressPercent) / 100,
                )
              : null
          }
          locale={context.globals.locale}
          onCommand={(command) => {
            args.onCommand(command)
            const current = args.media
            if (!current) return
            if (
              command === 'play-pause' ||
              command === 'play' ||
              command === 'pause'
            ) {
              updateArgs({
                media: {
                  ...current,
                  playbackStatus:
                    command === 'play' ||
                    (command === 'play-pause' &&
                      current.playbackStatus !== 'playing')
                      ? 'playing'
                      : 'paused',
                },
              })
            } else if (command === 'like')
              updateArgs({
                media: {
                  ...current,
                  isLiked: !current.isLiked,
                  isDisliked: false,
                },
              })
            else if (command === 'dislike')
              updateArgs({
                media: {
                  ...current,
                  isDisliked: !current.isDisliked,
                  isLiked: false,
                },
              })
            else if (typeof command === 'object' && 'seek' in command)
              updateArgs({
                progressMs: command.seek.positionMs,
                progressPercent:
                  (command.seek.positionMs / (current.durationMs || 1)) * 100,
              })
          }}
        />
      </div>
    )
  },
} satisfies Meta<PlayerArgs>
export default meta
type Story = StoryObj<typeof meta>
export const Playing: Story = { name: 'Воспроизведение' }
export const Paused: Story = {
  name: 'Пауза',
  args: { media: { ...media, playbackStatus: 'paused' } },
}
export const LongTrack: Story = {
  name: 'Длинный трек',
  args: {
    trackTitle:
      'Очень длинное название композиции — концертная версия с оркестром',
    trackArtist:
      'Первый исполнитель, второй исполнитель и симфонический оркестр',
  },
}
export const NoArtwork: Story = {
  name: 'Без обложки',
  args: { media: { ...media, thumbnailDataUrl: null } },
}
export const NoSession: Story = {
  name: 'Нет музыки',
  args: { media: null, progressMs: null, progressPercent: 0 },
}
export const DirectOffline: Story = {
  name: 'Яндекс Музыка недоступна',
  args: { media: { ...media, hasSession: false }, showDirectReload: true },
}
export const DirectRestarting: Story = {
  name: 'Яндекс Музыка перезапускается',
  args: { media: { ...media, hasSession: false }, directReloadBusy: true },
}
export const DirectRecovery: Story = {
  name: 'Связь прервалась во время воспроизведения',
  args: { showDirectReload: true },
}
export const DirectOfflineNarrow: Story = {
  name: 'Яндекс Музыка недоступна · 320 px',
  args: { media: { ...media, hasSession: false } },
  parameters: { workshop: { width: 320 } },
}
export const SmtcUnavailable: Story = {
  name: 'SMTC недоступен',
  args: { media: { ...media, provider: 'smtc', smtcHealth: 'unavailable' } },
}
export const Compact: Story = {
  name: 'Только кнопки',
  args: {
    density: 'buttons-only',
    showArtwork: false,
    showTitle: false,
    showArtist: false,
    showProgress: false,
  },
  parameters: { workshop: { width: 280 } },
}

export const DirectionalProgress: Story = {
  name: 'Прогресс · следующий и предыдущий трек',
  render: trackTransitionRender,
  parameters: { workshop: { note: 'Next заполняет текущую полосу до конца и гасит её, Previous опустошает полосу и гасит. Новый прогресс проявляется на своей фактической позиции; кнопка и подписи не сдвигаются.' } },
  play: async ({ canvasElement, args }) => {
    const player = within(canvasElement).getByRole('region', { name: 'Now playing' })
    const canvas = within(player)
    const seek = canvas.getByRole('button', { name: 'Seek track' })
    const motionEnabled = !args.reducedMotion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const trace: Array<{
      phase: string | null
      direction: string | null
      label: string
      ratio: string
      fillAnimation: string
      visualTransform: string
    }> = []
    const record = () => {
      const visual = seek.querySelector<HTMLElement>('.progress-visual')
      const fill = visual?.querySelector<HTMLElement>('.progress-fill')
      if (visual && fill) trace.push({
        phase: visual.dataset.progressPhase ?? null,
        direction: visual.dataset.progressDirection ?? null,
        label: visual.textContent ?? '',
        ratio: visual.style.getPropertyValue('--progress'),
        fillAnimation: getComputedStyle(fill).animationName,
        visualTransform: getComputedStyle(visual).transform,
      })
    }
    const observer = new MutationObserver(record)
    observer.observe(seek, { childList: true, subtree: true, attributes: true })
    const initialRatio = seek.querySelector<HTMLElement>('.progress-visual')!.style.getPropertyValue('--progress')
    try {
      await userEvent.click(canvas.getByRole('button', { name: 'Next' }))
      await expect(args.onCommand).toHaveBeenLastCalledWith('next')
      await waitFor(() => {
        const visual = seek.querySelector<HTMLElement>('.progress-visual')!
        expect(visual.dataset.progressPhase).toBe('stable')
        expect(visual.textContent).toContain('Вдоль ночных улиц')
      })
      if (motionEnabled) await expect(trace.some((entry) => entry.phase === 'exiting'
        && entry.direction === 'next'
        && entry.label.includes('Тёплый вечер')
        && entry.ratio === initialRatio
        && entry.fillAnimation === 'music-progress-next-fill-out'
        && entry.visualTransform === 'none')).toBe(true)
      await expect(seek.querySelector<HTMLElement>('.progress-visual')!.style.getPropertyValue('--progress')).toBe('0')
      trace.length = 0
      await userEvent.click(canvas.getByRole('button', { name: 'Previous' }))
      await expect(args.onCommand).toHaveBeenLastCalledWith('previous')
      await waitFor(() => {
        const visual = seek.querySelector<HTMLElement>('.progress-visual')!
        expect(visual.dataset.progressPhase).toBe('stable')
        expect(visual.textContent).toContain('Тёплый вечер')
      })
      if (motionEnabled) await expect(trace.some((entry) => entry.phase === 'exiting'
        && entry.direction === 'previous'
        && entry.fillAnimation === 'music-progress-previous-fill-out'
        && entry.visualTransform === 'none')).toBe(true)
      await expect(canvas.getByRole('button', { name: 'Seek track' })).toBe(seek)
    } finally { observer.disconnect() }
  },
}

export const ReducedMotionProgress: Story = {
  name: 'Смена трека · без движения',
  args: { reducedMotion: true },
  render: trackTransitionRender,
  play: async ({ canvasElement }) => {
    const canvas = within(within(canvasElement).getByRole('region', { name: 'Now playing' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }))
    const visual = canvas.getByRole('button', { name: 'Seek track' }).querySelector<HTMLElement>('.progress-visual')!
    const fill = visual.querySelector<HTMLElement>('.progress-fill')!
    await expect(visual).toHaveAttribute('data-progress-phase', 'stable')
    await expect(visual.textContent).toContain('Вдоль ночных улиц')
    await expect(getComputedStyle(fill).animationName).toBe('none')
  },
}

export const SeekGesture: Story = {
  name: 'Перемотка · одна команда за жест',
  render: trackTransitionRender,
  play: async ({ canvasElement, args }) => {
    const player = within(canvasElement).getByRole('region', { name: 'Now playing' })
    const seek = within(player).getByRole('button', { name: 'Seek track' })
    const captured = new Set<number>()
    // Synthetic PointerEvents have no native capture stream. Only that browser
    // boundary is substituted; the production pointer/seek handlers run intact.
    const descriptors = Object.fromEntries(['setPointerCapture', 'hasPointerCapture', 'releasePointerCapture'].map((name) => [name, Object.getOwnPropertyDescriptor(seek, name)]))
    Object.defineProperties(seek, {
      setPointerCapture: { configurable: true, value: (id: number) => captured.add(id) },
      hasPointerCapture: { configurable: true, value: (id: number) => captured.has(id) },
      releasePointerCapture: { configurable: true, value: (id: number) => captured.delete(id) },
    })
    const pointer = (type: string, ratio: number) => {
      const rect = seek.getBoundingClientRect()
      seek.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 41, pointerType: 'mouse', button: 0, clientX: rect.left + rect.width * ratio, clientY: rect.top + rect.height / 2 }))
    }
    try {
      pointer('pointerdown', .25)
      await waitFor(() => expect(seek).toHaveClass('progress-track--scrubbing'))
      pointer('pointermove', .6)
      pointer('pointerup', .6)
      await waitFor(() => expect(args.onCommand).toHaveBeenCalledWith({ seek: { positionMs: Math.round((args.media?.durationMs ?? media.durationMs!) * .6) } }))
      pointer('pointerup', .6)
      pointer('pointerdown', .2)
      pointer('pointercancel', .4)
      await expect(args.onCommand).toHaveBeenCalledTimes(1)
      await expect(captured.size).toBe(0)
      await waitFor(() => expect(seek).not.toHaveClass('progress-track--scrubbing'))
    } finally {
      for (const [name, descriptor] of Object.entries(descriptors)) {
        if (descriptor) Object.defineProperty(seek, name, descriptor)
        else Reflect.deleteProperty(seek, name)
      }
    }
  },
}
