import type { Meta, StoryObj } from '@storybook/react-vite'
import { ReleaseScene } from './ReleaseScene'
const meta = {
  title: 'Screens/Release2', component: ReleaseScene,
  parameters: { layout: 'fullscreen', workshop: { bare: true } },
  args: { feature: 'island', format: 'telegram' },
} satisfies Meta<typeof ReleaseScene>
export default meta
type Story = StoryObj<typeof meta>
export const Island: Story = { name: '01 · Свой островок' }
export const Taskbar: Story = { name: '02 · Панель задач', args: { feature: 'taskbar' } }
export const Voice: Story = { name: '03 · Better Voice', args: { feature: 'voice' } }
export const Usage: Story = { name: '04 · Лимиты ИИ', args: { feature: 'usage' } }
export const Settings: Story = { name: '05 · Настройки', args: { feature: 'settings' } }
