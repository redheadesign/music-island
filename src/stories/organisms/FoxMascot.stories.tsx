import type { Meta, StoryObj } from '@storybook/react-vite'
import { useArgs } from 'storybook/preview-api'
import { expect } from 'storybook/test'
import { Play, Square } from 'lucide-react'
import {
  FOX_CLIP_CATALOG,
  VoiceFoxMascot,
} from '../../features/plugins/voice/VoiceFoxMascot'
import { VoiceSettingsView } from '../../features/plugins/voice/VoiceSettingsView'
import { IconButton } from '../../shared/ui/IconButton'

const meta = {
  title: 'Organisms/FoxMascot',
  component: VoiceFoxMascot,
  args: { live: false, active: true, previewClipId: null, size: 'settings' },
  argTypes: {
    live: { name: 'Обработка включена' },
    active: { name: 'Компонент виден' },
    size: {
      name: 'Размер',
      options: ['settings', 'compact', 'preview'],
      control: {
        type: 'inline-radio',
        labels: { settings: 'Настройки · 208 px', compact: 'Компактный · 128 px', preview: 'Детали · 255 px' },
      },
      description: 'Настройки: 208 px, в контейнере до 480 px — 176 px. Компактный размер остаётся 128 px; просмотр деталей — 255 px.',
    },
    className: { table: { disable: true } },
    previewClipId: {
      name: 'Отдельный клип',
      control: 'select',
      options: [null, ...FOX_CLIP_CATALOG.map((clip) => clip.id)],
    },
  },
  parameters: {
    workshop: {
      width: 380,
      height: 360,
      note: 'Настоящий VoiceFoxMascot в размере настроек — 208 px. Кнопка меняет только анимацию; микрофон не запускается. Переход начинается после завершения текущего клипа. Размеры и отдельные клипы доступны в Controls.',
    },
  },
  render: function Mascot(args) {
    const [, updateArgs] = useArgs()
    return (
      <div className="sample-column" style={{ justifyItems: 'center' }}>
        <VoiceFoxMascot {...args} />
        <div className="sample-row">
          <IconButton
            aria-label={args.live ? 'Вернуть в ожидание' : 'Включить активный цикл'}
            aria-pressed={args.live}
            style={{ width: 'var(--control-height)', height: 'var(--control-height)' }}
            onClick={() => updateArgs({ live: !args.live, previewClipId: null })}
          >
            {args.live ? <Square size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          </IconButton>
          <span style={{ color: 'var(--fg-secondary)', fontSize: 'var(--text-label)' }}>
            {args.previewClipId ?? (args.live ? 'Активный цикл' : 'Режим ожидания')}
          </span>
        </div>
      </div>
    )
  },
} satisfies Meta<typeof VoiceFoxMascot>
export default meta
type Story = StoryObj<typeof meta>
export const Interactive: Story = { name: 'Размер настроек · 208 px' }
export const Live: Story = { name: 'Обработка включена', args: { live: true } }
export const Compact: Story = {
  name: 'Компактный · 128 px',
  args: { size: 'compact' },
  parameters: { workshop: { note: 'Отдельный компактный размер VoiceFoxMascot: 128 px. В узких настройках используется более крупный вариант 176 px.' } },
}
export const Detail: Story = {
  name: 'Просмотр деталей · 255 px',
  args: { size: 'preview', live: true },
  parameters: { workshop: { height: 420, note: 'Крупный размер для проверки краев и движения. Кнопка переключает штатный цикл; клипы и скорость не меняются.' } },
}
export const InSettings: Story = {
  name: 'В настройках Better Voice',
  parameters: {
    controls: { disable: true },
    workshop: { width: 860, note: 'Настоящий экран VoiceSettingsView использует VoiceFoxMascot с size=settings: 208 px. Управление работает с локальным адаптером Storybook.' },
  },
  render: (_args, context) => (
    <div className="settings-window-root">
      <VoiceSettingsView locale={context.globals.locale} active showExperimentalBanner={false} />
    </div>
  ),
  play: async ({ canvasElement }) => checkSettingsMascot(canvasElement),
}
export const InSettingsMinimum: Story = {
  name: 'В настройках · 620 px',
  parameters: { controls: { disable: true }, workshop: { width: 620, note: 'Маскот 208 px и управление рядом при минимальной ширине нативных настроек.' } },
  render: InSettings.render,
  play: InSettings.play,
}
export const InSettingsNarrow: Story = {
  name: 'В настройках · 420 px',
  parameters: { controls: { disable: true }, workshop: { width: 420, note: 'Маскот 176 px; управление расположено ниже и не перекрывает иллюстрацию.' } },
  render: InSettings.render,
  play: InSettings.play,
}
export const InSettingsSmall: Story = {
  name: 'В настройках · 320 px',
  parameters: { controls: { disable: true }, workshop: { width: 320, note: 'Узкий контейнер: размер маскота принадлежит общему компоненту, карточка сохраняет доступную ширину управления.' } },
  render: InSettings.render,
  play: InSettingsNarrow.play,
}

async function checkSettingsMascot(canvasElement: HTMLElement) {
  const card = canvasElement.querySelector<HTMLElement>('.voice-control-card')!
  const style = getComputedStyle(card)
  // Storybook's surrounding panes can further constrain the requested width.
  const available = card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  const stacked = available <= 480
  const fox = card.querySelector<HTMLElement>('.voice-fox-mascot')!.getBoundingClientRect()
  const controls = card.querySelector<HTMLElement>('.voice-control-card__controls')!.getBoundingClientRect()
  await expect(fox.width).toBe(stacked ? 176 : 208)
  await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
  if (stacked) await expect(controls.top).toBeGreaterThanOrEqual(fox.bottom)
  else await expect(controls.left).toBeGreaterThanOrEqual(fox.right)
}
export const Sleep: Story = {
  name: 'Спит',
  args: { previewClipId: 'fox-sleep' },
}
export const Wake: Story = {
  name: 'Просыпается',
  args: { previewClipId: 'fox-wake' },
}
export const ToSleep: Story = {
  name: 'Засыпает',
  args: { previewClipId: 'fox-to-sleep' },
}
export const LiveB: Story = {
  name: 'Live · B',
  args: { previewClipId: 'fox-live-b' },
}
export const LiveC: Story = {
  name: 'Live · C',
  args: { previewClipId: 'fox-live-c' },
}
export const LiveD: Story = {
  name: 'Live · D',
  args: { previewClipId: 'fox-live-d' },
}
export const Transparency: Story = {
  name: 'Прозрачность',
  args: { live: true },
  globals: { surface: 'checker' },
}
