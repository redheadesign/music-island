import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { TaskbarPlayer, type TaskbarPlayerProps } from '../../features/taskbar/TaskbarPlayer'
import { media } from '../fixtures'

// Preview interactions update React state without replacing Storybook's args/mocks.
function TaskbarPlayerPreview({ args, locale, height }: {
  args: TaskbarPlayerProps
  locale: TaskbarPlayerProps['locale']
  height: 32 | 40
}) {
  const [snapshot, setSnapshot] = useState(args.snapshot)
  useEffect(() => setSnapshot(args.snapshot), [args.snapshot])
  return (
    <div style={{ width: '100%', '--taskbar-player-height': `${height}px` } as CSSProperties}>
      <TaskbarPlayer {...args} snapshot={snapshot} locale={locale}
        onCommand={(command) => {
          args.onCommand(command)
          if (command === 'play-pause') {
            setSnapshot((current) => current
              ? { ...current, playbackStatus: current.playbackStatus === 'playing' ? 'paused' : 'playing' }
              : current)
          }
        }} />
    </div>
  )
}

function playerRegion(canvasElement: HTMLElement) {
  return within(canvasElement).getByRole('region', { name: /^(Плеер в панели задач|Taskbar player)$/ })
}

function playerCanvas(canvasElement: HTMLElement) {
  return within(playerRegion(canvasElement))
}

async function expectNativeSize(canvasElement: HTMLElement, height: 32 | 40, width = 144, scale = 1) {
  const player = playerRegion(canvasElement)
  const bounds = player.getBoundingClientRect()
  await expect(bounds.width).toBe(width)
  await expect(bounds.height).toBe(height)
  await expect(player.textContent?.trim()).toBe('')
  for (const button of within(player).getAllByRole('button')) {
    await expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(30 * scale)
    await expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(Math.min(30 * scale, height))
  }
}

const meta = {
  title: 'Organisms/TaskbarPlayer',
  component: TaskbarPlayer,
  args: {
    snapshot: { ...media, provider: 'smtc' },
    locale: 'ru',
    reducedMotion: false,
    unavailable: false,
    onCommand: fn().mockName('taskbar.command'),
  },
  parameters: {
    workshop: {
      width: 144,
      note: 'Плеер в настоящем размере: ширина 144 px, обложка и три кнопки. Название и исполнитель доступны в подсказке обложки. Управление меняет только демонстрационный трек.',
    },
    controls: { exclude: ['locale'] },
  },
  render: (args, context) => <TaskbarPlayerPreview args={args} locale={context.globals.locale}
    height={context.parameters.taskbarHeight === 32 ? 32 : 40} />,
} satisfies Meta<typeof TaskbarPlayer>
export default meta
type Story = StoryObj<typeof meta>

export const Playing: Story = {
  name: 'Воспроизведение',
  play: async ({ canvasElement, args }) => {
    const canvas = playerCanvas(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^(Предыдущий трек|Previous track)$/ }))
    await expect(args.onCommand).toHaveBeenLastCalledWith('previous')
    await userEvent.click(canvas.getByRole('button', { name: /^(Пауза|Pause)$/ }))
    await expect(args.onCommand).toHaveBeenLastCalledWith('play-pause')
    await expect(canvas.getByRole('button', { name: /^(Воспроизвести|Play)$/ })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByRole('button', { name: /^(Пауза|Pause)$/ })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: /^(Следующий трек|Next track)$/ }))
    await expect(args.onCommand).toHaveBeenLastCalledWith('next')
  },
}

export const Paused: Story = {
  name: 'Пауза',
  args: { snapshot: { ...media, playbackStatus: 'paused' } },
}

export const NoSession: Story = {
  name: 'Нет музыки',
  args: { snapshot: null },
  play: async ({ canvasElement, args }) => {
    const buttons = playerCanvas(canvasElement).getAllByRole('button')
    for (const button of buttons) {
      await expect(button).toBeDisabled()
      await userEvent.click(button)
    }
    await expect(args.onCommand).not.toHaveBeenCalled()
  },
}

export const NoCapabilities: Story = {
  name: 'Плеер не поддерживает команды',
  args: { snapshot: { ...media, canGoPrevious: false, canGoNext: false, canPause: false, canPlay: true } },
  play: async ({ canvasElement }) => {
    // A playing source requires canPause, even when canPlay is true.
    for (const button of playerCanvas(canvasElement).getAllByRole('button')) await expect(button).toBeDisabled()
  },
}

export const NoSessionStaleCapabilities: Story = {
  name: 'Сессия закрыта · старые capabilities',
  args: { snapshot: { ...media, hasSession: false, provider: 'smtc' } },
  play: NoSession.play,
}

export const SourceUnavailable: Story = {
  name: 'Нет связи с плеером',
  args: { snapshot: { ...media, provider: 'smtc', smtcHealth: 'unavailable' } },
  play: NoSession.play,
}

export const DirectRecovery: Story = {
  name: 'Direct · связь потеряна при воспроизведении',
  args: { snapshot: { ...media, hasSession: true, playbackStatus: 'playing' }, unavailable: true },
  play: async (context) => {
    await NoSession.play?.(context)
    await expect(playerRegion(context.canvasElement)).toHaveAttribute('data-empty', 'true')
  },
}

export const LongTitle: Story = {
  name: 'Длинное название в подсказке',
  args: {
    snapshot: { ...media, title: 'Очень длинное название композиции — концертная версия с оркестром', artist: 'Первый исполнитель, второй исполнитель и симфонический оркестр' },
  },
}

export const Narrow: Story = {
  name: 'Размер в панели задач · 144 × 40 px',
  parameters: { workshop: { width: 144 } },
  args: LongTitle.args,
  play: async ({ canvasElement }) => expectNativeSize(canvasElement, 40),
}

export const ShortTaskbar: Story = {
  name: 'Низкая панель · 32 px',
  parameters: { taskbarHeight: 32, workshop: { width: 144 } },
  play: async ({ canvasElement }) => expectNativeSize(canvasElement, 32),
}

export const Narrow240: Story = {
  name: 'Фиксированный размер в широком контейнере',
  parameters: { workshop: { width: 240 } },
  args: LongTitle.args,
  play: async ({ canvasElement }) => expectNativeSize(canvasElement, 40),
}

export const ShortTaskbarNarrow: Story = {
  name: 'Низкая панель · 144 × 32 px · клавиатура',
  parameters: { taskbarHeight: 32, workshop: { width: 144 } },
  args: LongTitle.args,
  play: async (context) => {
    await expectNativeSize(context.canvasElement, 32)
    await Playing.play?.(context)
  },
}

export const NoArtwork: Story = {
  name: 'Без обложки',
  args: { snapshot: { ...media, thumbnailDataUrl: null } },
}

export const OpenSettings: Story = {
  name: 'Открытие островка',
  args: { onOpenIsland: fn().mockName('taskbar.island') },
  play: async ({ canvasElement, args }) => {
    const metadata = playerCanvas(canvasElement).getByRole('button', { name: /^(Открыть островок|Open island)/ })
    await userEvent.click(metadata)
    await userEvent.keyboard('{Enter}')
    await expect(args.onOpenIsland).toHaveBeenCalledTimes(2)
  },
}

export const WithLike: Story = {
  name: 'С кнопкой «Нравится»',
  args: { showLike: true },
  parameters: { workshop: { width: 176 } },
  play: async ({ canvasElement, args }) => {
    await expectNativeSize(canvasElement, 40, 176)
    await userEvent.click(playerCanvas(canvasElement).getByRole('button', { name: /^(Нравится|Like)$/ }))
    await expect(args.onCommand).toHaveBeenLastCalledWith('like')
  },
}

export const ShuffleRepeat: Story = {
  name: 'Перемешивание и повтор трека',
  args: {
    layout: { version: 1, elements: ['cover', 'previous', 'transport', 'next', 'like', 'shuffle', 'repeat'] },
    snapshot: { ...media, isShuffleActive: true, repeatMode: 'one' },
  },
  parameters: { workshop: { width: 240 } },
  play: async ({ canvasElement, args }) => {
    await expectNativeSize(canvasElement, 40, 240)
    const canvas = playerCanvas(canvasElement)
    const shuffle = canvas.getByRole('button', { name: /^(Перемешать|Shuffle)$/ })
    const repeat = canvas.getByRole('button', { name: /^(Повтор|Repeat)$/ })
    await expect(shuffle).toHaveAttribute('aria-pressed', 'true')
    await expect(repeat).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(shuffle)
    await expect(args.onCommand).toHaveBeenLastCalledWith('toggle-shuffle')
    await userEvent.click(repeat)
    await expect(args.onCommand).toHaveBeenLastCalledWith('cycle-repeat')
  },
}

export const SmallScale: Story = {
  name: 'Масштаб 75%',
  args: { scale: .75 },
  parameters: { workshop: { width: 144 } },
  play: async ({ canvasElement }) => expectNativeSize(canvasElement, 40, 108, .75),
}

export const ReducedMotion: Story = {
  name: 'Без движения',
  args: { reducedMotion: true },
}
