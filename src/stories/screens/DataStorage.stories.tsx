import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { DataSettings } from '../../features/settings/DataSettings'
import '../../features/dictation/dictation.css'
const meta = {
  title: 'Screens/DataStorage', component: DataSettings,
  args: { active: true, locale: 'ru' },
  parameters: { workshop: { width: 700, height: 500, note: 'Тестовые размеры. Нативное удаление здесь не вызывается.' } },
  render: (args, context) => <div className="settings-panel" data-color-scheme={context.parameters.light ? 'light' : 'dark'} style={{ padding: 28, background: 'var(--surface-canvas)' }}><DataSettings {...args} /></div>,
} satisfies Meta<typeof DataSettings>
export default meta
type Story = StoryObj<typeof meta>
export const Overview: Story = { name: 'Объём данных' }
export const Light: Story = { name: 'Светлая тема', parameters: { light: true } }
export const English: Story = { name: 'Storage · English', args: { locale: 'en' } }
export const RemovalConfirmation: Story = { name: 'Полная очистка · состав и отмена', play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  const trigger = await canvas.findByRole('button', { name: 'Удалить все данные и выйти' })
  await userEvent.click(trigger)
  const dialog = canvas.getByRole('dialog')
  await expect(dialog).toHaveTextContent('Handy, общий кэш Hugging Face и файл EXE останутся на месте.')
  await expect(dialog).toHaveTextContent('AppData')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }))
  await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument()
  await expect(trigger).toHaveFocus()
  await userEvent.click(trigger)
} }
