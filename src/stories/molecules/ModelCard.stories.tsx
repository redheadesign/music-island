import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ModelCard } from '../../features/dictation/ModelCard'
import { gigaamRnnt, gigaamV4, gigaamV4Compact, parakeetEnglish } from '../dictationFixtures'
const meta = {
  title: 'Molecules/ModelCard', component: ModelCard,
  args: { model: gigaamV4, locale: 'ru', onDownload: fn(), onSelect: fn(), onCancel: fn(), onDelete: fn() },
  parameters: { workshop: { width: 600 } },
  render: args => <div className="auxiliary-ui dictation-page" style={{ padding: 20, background: 'var(--surface-canvas)' }}><ModelCard {...args} /></div>,
} satisfies Meta<typeof ModelCard>
export default meta
type Story = StoryObj<typeof meta>
export const Download: Story = { name: 'Рекомендуемая · скачать', play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  await expect(canvas.getByText('Рекомендовано для русского')).toBeVisible()
  await expect(canvas.getByRole('meter', { name: 'Скорость' })).toHaveAttribute('aria-valuenow', '70.9')
  await expect(canvas.getByRole('meter', { name: 'Точность · RU' })).toHaveAttribute('aria-valuenow', '97.47')
  await expect(canvas.getByRole('meter', { name: 'Точность · EN' })).toHaveAttribute('aria-valuenow', '93.44')
  await userEvent.click(canvas.getByText('Тест после записи · INT8'))
  await expect(canvas.getByText(/Apple M4 Pro/)).toHaveTextContent('2,53% для русского и 6,56% для английского')
} }
export const Compact: Story = { name: 'Компактная модель · офлайн-замеры', args: { model: gigaamV4Compact, locale: 'en' }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  await expect(canvas.getByText('Offline benchmark · INT8')).toBeVisible()
  await expect(canvas.getByRole('meter', { name: 'Speed' })).toHaveAttribute('aria-valuenow', '70.9')
  await expect(canvas.getByRole('meter', { name: 'Accuracy · RU' })).toHaveAttribute('aria-valuenow', '97.47')
  await expect(canvas.getByRole('meter', { name: 'Accuracy · EN' })).toHaveAttribute('aria-valuenow', '93.44')
  await userEvent.click(canvas.getByText('Offline benchmark · INT8'))
  await expect(canvas.getByText(/Apple M4 Pro/)).toHaveTextContent('2.53% for Russian and 6.56% for English')
} }
export const Selected: Story = { name: 'Выбрана · в памяти', args: { model: { ...gigaamRnnt, is_downloaded: true }, selected: true, loaded: true } }
export const English: Story = { name: 'English · Parakeet', args: { locale: 'en', model: parakeetEnglish }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  await expect(canvas.getByText('Recommended for English')).toBeVisible()
  await expect(canvas.getByRole('meter', { name: 'Speed' })).toHaveAttribute('aria-valuenow', '79')
  await expect(canvas.getByRole('meter', { name: 'Accuracy' })).toHaveAttribute('aria-valuenow', '90')
} }
export const Unrated: Story = {
  name: 'Скорость и точность без оценок',
  args: { model: { ...gigaamRnnt, id: 'custom/unrated', name: 'Custom model', is_custom: true, speed_score: 0, accuracy_score: 0 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Скорость')).toBeVisible()
    await expect(canvas.getByText('Точность')).toBeVisible()
    await expect(canvas.getAllByText('Нет оценки')).toHaveLength(2)
    await expect(canvas.queryByRole('meter')).not.toBeInTheDocument()
  },
}
export const EnglishModelRussian: Story = { name: 'Для английского · русский интерфейс', args: { model: parakeetEnglish }, play: async ({ canvasElement }) => {
  await expect(within(canvasElement).getByText('Рекомендовано для английского')).toBeVisible()
} }
export const RussianModelEnglish: Story = { name: 'For Russian · English UI', args: { locale: 'en' }, play: async ({ canvasElement }) => {
  await expect(within(canvasElement).getByText('Recommended for Russian')).toBeVisible()
} }
export const Downloading: Story = { name: 'Загрузка · отмена', args: { downloading: true, progress: 48 }, play: async ({ canvasElement, args }) => { await userEvent.click(within(canvasElement).getByRole('button', { name: 'Отменить' })); await expect(args.onCancel).toHaveBeenCalledOnce() } }
export const Failed: Story = { name: 'Ошибка сети · повторить', args: { error: 'Нет соединения с сервером.', model: { ...gigaamRnnt, partial_size: 4000 } } }
export const FailedRetry: Story = {
  ...Failed,
  name: 'не удалось скачать модель',
  globals: { interfaceTheme: 'glass' },
  parameters: { workshop: { width: 400 } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent('Нет соединения с сервером.')
    await userEvent.click(canvas.getByRole('button', { name: 'Повторить' }))
    await expect(args.onDownload).toHaveBeenCalledOnce()
  },
}
export const LongName: Story = { name: 'Длинное название · узкая карточка', args: { model: { ...gigaamRnnt, name: 'Custom speech recognition model with a long descriptive name' } }, parameters: { workshop: { width: 380 } } }
export const Actions: Story = { name: 'Действия · клавиатура', args: { model: { ...gigaamRnnt, is_downloaded: true }, selected: true }, play: async ({ canvasElement, args }) => {
  const trigger = within(canvasElement).getByRole('button', { name: /Удалить модель/ })
  await expect(trigger).toHaveAttribute('title', expect.stringContaining('Удалить модель'))
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  await expect(args.onDelete).toHaveBeenCalledOnce()
} }
