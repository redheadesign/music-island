import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, within, userEvent } from 'storybook/test'
import { MonitorSetting } from '../../features/settings/MonitorSetting'
const meta = {
  title: 'Molecules/MonitorSetting', component: MonitorSetting,
  args: { value: null, onChange: fn(), locale: 'ru' },
  parameters: { workshop: { width: 620 } },
  render: (args, context) => <div className="auxiliary-ui" data-color-scheme={context.parameters.light ? 'light' : 'dark'} style={{ padding: 24, background: 'var(--surface-panel)', color: 'var(--fg-primary)', borderRadius: 16 }}><MonitorSetting {...args} /></div>,
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
export const Light: Story = { name: 'Светлая тема', parameters: { light: true } }
export const English: Story = { name: 'English', args: { locale: 'en' } }
