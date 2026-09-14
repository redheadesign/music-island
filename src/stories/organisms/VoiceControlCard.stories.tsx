import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { VoiceControlCard, type VoiceControlCardProps } from '../../features/plugins/voice/VoiceControlCard'
import type { Locale } from '../../shared/lib/types'

function ControlPreview({ args, locale }: { args: VoiceControlCardProps; locale: Locale }) {
  const [running, setRunning] = useState(args.running)
  const [monitor, setMonitor] = useState(args.monitorEnabled)
  const [effect, setEffect] = useState(args.activeEffect)
  useEffect(() => { setRunning(args.running) }, [args.running])
  useEffect(() => { setMonitor(args.monitorEnabled) }, [args.monitorEnabled])
  useEffect(() => { setEffect(args.activeEffect) }, [args.activeEffect])
  return <VoiceControlCard {...args} locale={locale} running={running} monitorEnabled={monitor} activeEffect={effect}
    onToggleProcessing={() => { args.onToggleProcessing(); setRunning(!running); setEffect(null) }}
    onToggleMonitor={() => { args.onToggleMonitor(); setMonitor(!monitor) }}
    onToggleEffect={(next) => { args.onToggleEffect(next); setEffect(effect === next ? null : next) }} />
}

const meta = {
  title: 'Organisms/VoiceControlCard',
  component: VoiceControlCard,
  args: {
    locale: 'ru', running: false, monitorEnabled: false, activeEffect: null,
    busy: false, hydrated: true, active: true,
    onToggleProcessing: fn(), onToggleMonitor: fn(), onToggleEffect: fn(),
  },
  parameters: { workshop: { width: 760 } },
  render: (args, context) => <ControlPreview args={args} locale={context.globals.locale === 'en' ? 'en' : 'ru'} />,
} satisfies Meta<typeof VoiceControlCard>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = { name: 'Выключено' }
export const Running: Story = { name: 'Обработка включена', args: { running: true } }
export const MaterialStates: Story = {
  name: 'Материал · остановка и запуск',
  play: async ({ canvas, canvasElement }) => {
    const field = () => canvasElement.querySelector('.voice-atmosphere')!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    await expect(field()).toHaveAttribute('data-speed', reduced ? '0' : '0.225')
    await expect(getComputedStyle(field()).maskImage).toBe('none')
    await userEvent.click(canvas.getByRole('button', { name: /Включить обработку|Start processing/ }))
    await expect(field()).toHaveAttribute('data-speed', reduced ? '0' : '2.1')
    await userEvent.click(canvas.getByRole('button', { name: /Остановить|Stop processing/ }))
    await expect(field()).toHaveAttribute('data-speed', reduced ? '0' : '0.225')
  },
}
export const Monitoring: Story = { name: 'Прослушивание', args: { running: true, monitorEnabled: true } }
export const Effect: Story = { name: 'Эффект включён', args: { running: true, activeEffect: 4 } }
export const Starting: Story = { name: 'Запуск', args: { busy: true } }
export const Loading: Story = { name: 'Загрузка настроек', args: { hydrated: false } }
export const Error: Story = { name: 'Микрофон недоступен', args: { error: 'Не удалось открыть микрофон. Выберите другое устройство.' } }
export const Narrow: Story = { name: 'Узкая карточка · 420 px', args: { running: true }, parameters: { workshop: { width: 420 } } }
export const Compact: Story = { name: 'Компактная карточка · 320 px', args: { running: true, activeEffect: 4 }, parameters: { workshop: { width: 320 } } }
export const English: Story = { name: 'Английский интерфейс', globals: { locale: 'en' } }
export const Zoom150: Story = {
  name: 'Материал · масштаб 150%', args: { running: true },
  parameters: { workshop: { width: 1140 } },
  decorators: [(Story) => <div style={{ width: 760, zoom: 1.5 }}><Story /></div>],
}
export const Zoom200: Story = {
  name: 'Материал · масштаб 200%', args: { running: true },
  parameters: { workshop: { width: 1140 } },
  decorators: [(Story) => <div style={{ width: 570, zoom: 2 }}><Story /></div>],
}
export const Inactive: Story = {
  name: 'Скрытая вкладка · движение остановлено', args: { running: true, active: false },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.voice-atmosphere')).toHaveAttribute('data-motion', 'paused')
  },
}
export const ReducedMotion: Story = {
  name: 'Без движения', args: { running: true, reducedMotion: true },
  decorators: [(Story) => <div className="settings-panel" data-reduced-motion="true"><Story /></div>],
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.voice-atmosphere')).toHaveAttribute('data-motion', 'paused')
  },
}
export const Interactions: Story = {
  name: 'Запуск, прослушивание и эффекты',
  play: async ({ canvas, args }) => {
    const card = within(canvas.getByRole('region', { name: /Обработка голоса|Voice processing/ }))
    const monitor = card.getByRole('button', { name: /Прослушивать себя|Hear yourself/ })
    await userEvent.click(monitor)
    await expect(monitor).toHaveAttribute('aria-pressed', 'true')
    const robot = card.getByRole('button', { name: /Робот|Robot/ })
    await expect(robot).toBeDisabled()
    await userEvent.click(card.getByRole('button', { name: /Включить обработку|Start processing/ }))
    await userEvent.click(robot)
    await expect(robot).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(robot)
    await expect(robot).toHaveAttribute('aria-pressed', 'false')
    const stop = card.getByRole('button', { name: /Остановить|Stop processing/ })
    stop.focus()
    await userEvent.keyboard('{Enter}')
    await expect(robot).toBeDisabled()
    await expect(args.onToggleProcessing).toHaveBeenCalledTimes(2)
    await expect(args.onToggleEffect).toHaveBeenCalledTimes(2)
    await expect(args.onToggleMonitor).toHaveBeenCalledTimes(1)
  },
}
