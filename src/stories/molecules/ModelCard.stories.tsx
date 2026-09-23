import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ModelCard } from '../../features/dictation/ModelCard'
import { gigaamRnnt, parakeetEnglish } from '../dictationFixtures'
const meta = {
  title: 'Molecules/ModelCard', component: ModelCard,
  args: { model: gigaamRnnt, locale: 'ru', onDownload: fn(), onSelect: fn(), onCancel: fn(), onDelete: fn(), onDetails: fn() },
  parameters: { workshop: { width: 600 } },
  render: (args, context) => <div className="auxiliary-ui dictation-page" data-color-scheme={context.parameters.light ? 'light' : 'dark'} style={{ padding: 20, background: 'var(--surface-canvas)' }}><ModelCard {...args} /></div>,
} satisfies Meta<typeof ModelCard>
export default meta
type Story = StoryObj<typeof meta>
export const Download: Story = { name: 'Рекомендуемая · скачать' }
export const Selected: Story = { name: 'Выбрана · в памяти', args: { model: { ...gigaamRnnt, is_downloaded: true }, selected: true, loaded: true } }
export const English: Story = { name: 'English · Parakeet', args: { locale: 'en', model: parakeetEnglish } }
export const Light: Story = { name: 'Светлая тема', parameters: { light: true } }
export const Downloading: Story = { name: 'Загрузка · отмена', args: { downloading: true, progress: 48 }, play: async ({ canvasElement, args }) => { await userEvent.click(within(canvasElement).getByRole('button', { name: 'Отменить' })); await expect(args.onCancel).toHaveBeenCalledOnce() } }
export const Failed: Story = { name: 'Ошибка сети · повторить', args: { error: 'Нет соединения с сервером.', model: { ...gigaamRnnt, partial_size: 4000 } } }
export const LongName: Story = { name: 'Длинное название · узкая карточка', args: { model: { ...gigaamRnnt, name: 'Custom speech recognition model with a long descriptive name' } }, parameters: { workshop: { width: 380 } } }
export const Actions: Story = { name: 'Действия · клавиатура', args: { model: { ...gigaamRnnt, is_downloaded: true }, selected: true }, play: async ({ canvasElement, args }) => {
  const trigger = within(canvasElement).getByRole('button', { name: /Действия с моделью/ })
  await userEvent.click(trigger)
  const menu = within(document.body).getByRole('menu')
  await expect(within(menu).getByRole('menuitem', { name: 'Удалить модель' })).toHaveFocus()
  await userEvent.keyboard('{Escape}')
  await expect(trigger).toHaveFocus()
  await userEvent.click(trigger)
  await userEvent.keyboard('{Enter}')
  await expect(args.onDelete).toHaveBeenCalledOnce()
} }
