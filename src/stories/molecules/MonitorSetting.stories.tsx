import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, within, userEvent, waitFor } from 'storybook/test'
import { MonitorSetting } from '../../features/settings/MonitorSetting'
import { restoreMonitorPreview } from '../mocks/tauriApi'
const meta = {
  title: 'Molecules/MonitorSetting', component: MonitorSetting,
  args: { value: null, onChange: fn(), locale: 'ru' },
  parameters: { workshop: { width: 620 } },
  render: (args, context) => <div className="auxiliary-ui" data-interface-theme={context.globals.interfaceTheme} data-color-scheme={context.parameters.light ? 'light' : 'dark'} style={{ padding: 24, background: 'var(--surface-panel)', color: 'var(--fg-primary)', borderRadius: 16 }}><MonitorSetting {...args} /></div>,
} satisfies Meta<typeof MonitorSetting>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = { name: 'Основной и дополнительный монитор', play: async ({ canvasElement, args }) => {
  const trigger = await within(canvasElement).findByRole('button', { name: 'Монитор островка' })
  await userEvent.click(trigger)
  await userEvent.click(within(document.body).getByRole('option', { name: /1080 × 1920/ }))
  await expect(args.onChange).toHaveBeenCalledWith('display-portrait')
} }
export const Disconnected: Story = { name: 'Монитор отключён · временно основной', args: { value: 'display-away' } }
export const GlassLoadError: Story = {
  name: 'Стекло · ошибка списка мониторов',
  globals: { interfaceTheme: 'glass' },
  parameters: { nativePreview: { monitorLoadError: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Не удалось загрузить список мониторов')
    await expect(canvas.getByRole('button', { name: 'Монитор островка' })).toBeDisabled()
  },
}
export const GlassLoadRecovery: Story = {
  ...GlassLoadError,
  name: 'Стекло · повторная загрузка мониторов',
  play: async (context) => {
    await GlassLoadError.play?.(context)
    const canvas = within(context.canvasElement)
    restoreMonitorPreview()
    await userEvent.click(canvas.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(canvas.getByRole('button', { name: 'Монитор островка' })).toBeEnabled())
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument()
  },
}
export const Light: Story = { name: 'Светлая тема', parameters: { light: true } }
export const English: Story = { name: 'English', args: { locale: 'en' } }
