import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { DictationOverlayView } from '../../features/dictation/DictationOverlay'
const meta = { title: 'Molecules/DictationOverlay', component: DictationOverlayView,
  args: { visible: true, status: {revision: 1, operationId: 1, phase: 'recording', ready: true, text: '', error: null}, levels: [.3,.5,.7,.9,.4,.6,.3,.2], text: {committed: '', tentative: ''}, locale: 'ru', cancel: fn(async () => {}), copy: fn(async () => {}) },
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
