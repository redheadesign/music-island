import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { Onboarding } from '../../features/intro/Onboarding'
import { getDefaultConfig } from '../../app/tauriApi'
import { withUiPrefs } from '../../shared/lib/uiPrefs'
const meta = {
  title: 'Screens/Onboarding', component: Onboarding,
  args: { config: getDefaultConfig(), onFinish: fn(), exePath: 'C:\\Apps\\Music Island\\music-island.exe' },
  parameters: { workshop: { width: 860, height: 660, note: 'Реальные компоненты островка. Модели и подключения не запускаются.' } },
} satisfies Meta<typeof Onboarding>
export default meta
type Story = StoryObj<typeof meta>
export const FirstLaunch: Story = { name: 'Первый запуск · четыре шага', play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: 'Далее' }))
  await canvas.findByRole('heading', { name: 'Настройте островок под себя' })
  await userEvent.click(canvas.getByRole('button', { name: 'Далее' }))
  await canvas.findByRole('heading', { name: 'Говорите вместо печати' })
  await userEvent.click(canvas.getByRole('button', { name: 'Далее' }))
  await canvas.findByRole('heading', { name: 'Запуск вместе с Windows' })
  await userEvent.click(canvas.getByRole('button', { name: 'Включить и начать' }))
  await expect(args.onFinish).toHaveBeenCalledWith(true)
} }
export const Layout: Story = { name: '02 · Настройте островок под себя', args: { initialStep: 1 } }
export const Voice: Story = { name: '03 · Диктовка', args: { initialStep: 2 } }
export const Autostart: Story = { name: '04 · Автозагрузка', args: { initialStep: 3 } }
export const Skip: Story = { name: 'Пропустить · автозагрузка по согласию', play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: 'Пропустить знакомство' }))
  await userEvent.click(await canvas.findByRole('button', { name: 'Не сейчас' }))
  await expect(args.onFinish).toHaveBeenCalledWith(undefined)
} }
export const AutostartEnabled: Story = { name: 'Автозагрузка уже включена', args: { initialStep: 3, config: { ...getDefaultConfig(), behavior: { ...getDefaultConfig().behavior, launchAtStartup: true } } } }
export const SaveError: Story = { name: 'Ошибка регистрации', args: { initialStep: 3, onFinish: fn(async () => { throw new Error('Access denied') }) }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: 'Включить и начать' }))
  await expect(await canvas.findByRole('alert')).toHaveTextContent('Не удалось')
  await expect(canvas.getByRole('button', { name: 'Не сейчас' })).toBeEnabled()
} }
export const Light: Story = { name: 'Светлая тема', args: { config: withUiPrefs(getDefaultConfig(), { settingsColorScheme: 'light' }) } }
export const English: Story = { name: 'English', args: { config: { ...getDefaultConfig(), appearance: { ...getDefaultConfig().appearance, locale: 'en' } } } }
export const ReducedMotion: Story = { name: 'Без движения', args: { config: { ...getDefaultConfig(), appearance: { ...getDefaultConfig().appearance, reducedMotion: true } } } }
