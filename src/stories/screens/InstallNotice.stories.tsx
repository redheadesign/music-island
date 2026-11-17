import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { AlreadyRunningNotice } from '../../features/notice/AlreadyRunningNotice'
import { getDefaultConfig, setInstallPreview } from '../mocks/tauriApi'
import { withUiPrefs } from '../../shared/lib/uiPrefs'

const meta = {
  title: 'Screens/InstallNotice',
  component: AlreadyRunningNotice,
  args: { config: withUiPrefs(getDefaultConfig(), { interfaceTheme: 'glass' }) },
  parameters: { a11y: { test: 'error' }, workshop: { width: 380, height: 220 } },
} satisfies Meta<typeof AlreadyRunningNotice>
export default meta
type Story = StoryObj<typeof meta>
export const Running: Story = { name: 'Приложение уже открыто' }
export const NewerVersion: Story = {
  name: 'Доступна установленная копия',
  beforeEach: () => setInstallPreview({ path: 'C:/Music Island/music-island.exe', version: '3.1.1' }),
}
export const OpenFailed: Story = {
  name: 'Не удалось открыть установленную копию',
  beforeEach: () => setInstallPreview({ path: 'C:/Music Island/music-island.exe', version: '3.1.1' }, true),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const open = await canvas.findByRole('button', { name: 'Открыть новую версию' })
    await userEvent.click(open)
    await expect(await canvas.findByText(/Не удалось открыть файл/)).toBeVisible()
    await expect(open).toBeEnabled()
  },
}
