import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { DictationOverlayView } from '../../features/dictation/DictationOverlay'
import { defaultDictationAppearance } from '../../shared/lib/dictationAppearance'
const meta = { title: 'Molecules/DictationOverlay', component: DictationOverlayView,
  args: { appearance: { ...defaultDictationAppearance, theme: 'classic' }, visible: true, status: {revision: 1, operationId: 1, phase: 'recording', ready: true, text: '', error: null}, levels: [.3,.5,.7,.9,.4,.6,.3,.2], text: {committed: '', tentative: ''}, locale: 'ru', finish: fn(async () => {}), cancel: fn(async () => {}), copy: fn(async () => {}) },
  parameters: {workshop: {width: 550, height: 200}},
} satisfies Meta<typeof DictationOverlayView>
export default meta
type Story = StoryObj<typeof meta>
export const Recording: Story = {name: 'Запись'}
export const Preparing: Story = {name: 'Подготовка', args: {status: {...meta.args.status, phase: 'preparing', ready: false}}}
export const Transcribing: Story = {name: 'Распознавание', args: {status: {...meta.args.status, phase: 'transcribing'}}}
export const Processing: Story = {name: 'Обработка текста', args: {status: {...meta.args.status, phase: 'processing'}}}
export const Completed: Story = {name: 'Готово', args: {status: {...meta.args.status, phase: 'completed', text: 'Тестовая запись.'}}}
export const Cancelled: Story = {name: 'Отменено', args: {status: {...meta.args.status, phase: 'cancelled'}}}
export const Error: Story = {name: 'Ошибка вставки · копирование', args: {status: {...meta.args.status, phase: 'error', text: 'Тестовая запись.', error: 'Target window closed'}}, play: async ({ canvasElement, args }) => {
  await userEvent.click(within(canvasElement).getByRole('button', { name: 'Скопировать текст' }))
  await expect(args.copy).toHaveBeenCalledOnce()
}}
export const LiveText: Story = {name: 'Потоковый текст', args: {text: {committed: 'Отправьте, пожалуйста, ', tentative: 'последнюю версию'}}}
export const ReducedMotion: Story = {name: 'Без движения · English', args: {reducedMotion: true, locale: 'en'}}
export const Waves: Story = { name: 'Волны · запись', args: { appearance: { ...defaultDictationAppearance, theme: 'wave', palette: 'prism' }, demo: true } }
export const WaveProcessing: Story = { ...Waves, name: 'Волны · светящиеся частицы при распознавании', args: { ...Waves.args, status: { ...meta.args.status, phase: 'transcribing' } } }
export const WaveCompleted: Story = { ...Waves, name: 'Волны · частицы собираются в галочку', args: { ...Waves.args, status: { ...meta.args.status, phase: 'completed' } } }
export const WaveStill: Story = { ...Waves, name: 'Волны · без движения', args: { ...Waves.args, reducedMotion: true } }
export const CloudActions: Story = { ...Waves, name: 'Волны · одна кнопка завершения', play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement)
  await expect(canvas.queryByRole('button', { name: /^Отменить запись$/ })).not.toBeInTheDocument()
  await expect(canvas.queryAllByRole('button', { name: /Завершить/ })).toHaveLength(1)
  await userEvent.click(canvas.getByRole('button', { name: /^Завершить запись$/ }))
  await expect(args.finish).toHaveBeenCalledOnce()
  await expect(args.cancel).not.toHaveBeenCalled()
} }
export const WaveHold: Story = { ...Waves, name: 'Волны · удержание без кнопок', args: { ...Waves.args, status: { ...meta.args.status, shortcutActivation: 'push_to_talk' } }, play: async ({ canvasElement }) => {
  await expect(canvasElement.querySelectorAll('.dictation-overlay button')).toHaveLength(0)
} }
export const ClassicHold: Story = { name: 'Классическая · удержание без кнопок', args: { status: { ...meta.args.status, shortcutActivation: 'push_to_talk' } }, play: async ({ canvasElement }) => {
  // Measure after the classic capsule's arrival scale has settled.
  await waitFor(() => {
    const pill = canvasElement.querySelector('.dictation-overlay')!.getBoundingClientRect()
    const mic = canvasElement.querySelector('.dictation-overlay__art')!.getBoundingClientRect()
    const label = canvasElement.querySelector('.dictation-overlay__label')!.getBoundingClientRect()
    const levels = canvasElement.querySelector('.dictation-overlay__levels')!.getBoundingClientRect()
    expect(mic.left - pill.left).toBeCloseTo(14, 0)
    expect(pill.right - levels.right).toBeCloseTo(mic.left - pill.left, 0)
    expect(label.left - mic.right).toBeCloseTo(9, 0)
    expect(levels.left - label.right).toBeCloseTo(label.left - mic.right, 0)
    expect(pill.width).toBeLessThan(190)
  })
  await expect(canvasElement.querySelectorAll('.dictation-overlay button')).toHaveLength(0)
} }
export const SlowModelLoad: Story = { name: 'Холодный запуск · загрузка модели', args: { status: { ...meta.args.status, phase: 'transcribing', modelLoading: true } } }
export const SlowLiveModelLoad: Story = { ...Waves, name: 'Потоковая запись · долгая загрузка модели', args: { ...Waves.args, status: { ...meta.args.status, phase: 'streaming', modelLoading: true, shortcutActivation: 'push_to_talk' } } }
export const FoxQuiet: Story = { name: 'Лиса · тишина и глазки', args: { appearance: { ...defaultDictationAppearance, theme: 'pixels' }, levels: [] } }
export const PixelFox: Story = { name: 'Лиса · речь и ушки', args: { appearance: { ...defaultDictationAppearance, theme: 'pixels', palette: 'ember' }, demo: true } }
export const FoxHold: Story = { ...PixelFox, name: 'Лиса · удержание без кнопок', args: { ...PixelFox.args, status: { ...meta.args.status, shortcutActivation: 'push_to_talk' } }, play: WaveHold.play }
export const FoxSingleAction: Story = { ...PixelFox, name: 'Лиса · одна кнопка завершения', play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement)
  await expect(canvas.queryByRole('button', { name: 'Отменить запись' })).not.toBeInTheDocument()
  await expect(canvas.queryAllByRole('button', { name: /Завершить/ })).toHaveLength(1)
  await expect(canvasElement.querySelectorAll('.dictation-cloud__satellite')).toHaveLength(1)
  await userEvent.click(canvas.getByRole('button', { name: /^Завершить запись$/ }))
  await expect(args.finish).toHaveBeenCalledOnce()
  await expect(args.cancel).not.toHaveBeenCalled()
} }
export const FoxLiveText: Story = { ...PixelFox, name: 'Лиса · потоковый текст', args: { ...PixelFox.args, ...LiveText.args } }
export const FoxPreparing: Story = { ...PixelFox, name: 'Лиса · подготовка', args: { ...PixelFox.args, status: { ...meta.args.status, phase: 'preparing' } } }
export const FoxProcessing: Story = { ...PixelFox, name: 'Распознавание · мини-игры без ушек', args: { ...PixelFox.args, status: { ...meta.args.status, phase: 'transcribing' } } }
export const FoxSnake: Story = { ...FoxProcessing, name: 'Змейка · без ушек', args: { ...FoxProcessing.args, status: { ...meta.args.status, phase: 'transcribing', operationId: 2 }, reducedMotion: true } }
export const FoxCompleted: Story = { ...PixelFox, name: 'Лиса · готово', args: { ...PixelFox.args, status: { ...meta.args.status, phase: 'completed' } } }
export const FoxError: Story = { ...PixelFox, name: 'Лиса · ошибка вставки', args: { ...PixelFox.args, status: { ...meta.args.status, phase: 'error', text: 'Тестовая запись.' } } }
export const FoxStill: Story = { ...PixelFox, name: 'Лиса · без движения', args: { ...PixelFox.args, reducedMotion: true } }

function RestartPreview(args: ComponentProps<typeof DictationOverlayView>) {
  const [visible, setVisible] = useState(true)
  return <><button onClick={() => setVisible(value => !value)}>{visible ? 'Скрыть запись' : 'Показать запись'}</button><DictationOverlayView {...args} visible={visible} /></>
}
export const FoxRestart: Story = { ...PixelFox, name: 'Лиса · повторный запуск сохраняет графику', render: args => <RestartPreview {...args} />, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  const surface = canvasElement.querySelector('.dictation-cloud-surface')!
  await waitFor(() => expect(surface.getAttribute('data-fallback')).toBeNull())
  await userEvent.click(canvas.getByRole('button', { name: 'Скрыть запись' }))
  await expect(canvasElement.querySelector('.dictation-overlay')).not.toBeVisible()
  await expect(canvasElement.querySelector('.dictation-visual--pixels')).toBeNull()
  await userEvent.click(canvas.getByRole('button', { name: 'Показать запись' }))
  await expect(canvasElement.querySelector('.dictation-cloud-surface')).toBe(surface)
  await expect(canvasElement.querySelector('.dictation-overlay')).toBeVisible()
  await expect(canvasElement.querySelector('.dictation-visual--pixels')).not.toBeNull()
} }
