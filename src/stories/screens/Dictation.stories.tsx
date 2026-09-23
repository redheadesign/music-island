import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test'
import { DictationSettings } from '../../features/dictation/DictationSettings'
import type { DictationController } from '../../app/useIslandApp'
import { dictationApi } from '../mocks/dictationApi'
import { dictationModels, dictationSettings, gigaamRnnt, parakeetEnglish } from '../dictationFixtures'
const controller: DictationController = { enabled: true, api: dictationApi, busy: null, error: null, progress: {}, enable: fn(async () => {}), disable: fn(async () => {}), loadMoreHistory: fn(async () => {}), refresh: fn(async () => {}), run: fn(async (_id, action) => { await action() }), data: { settings: dictationSettings, models: [gigaamRnnt, parakeetEnglish, ...dictationModels], history: [], microphones: [{ index: '0', name: 'Microphone (USB Audio)', is_default: true }], path: 'C:\\Users\\User\\AppData\\Roaming\\Music Island\\dictation' } }
const meta = {
  title: 'Screens/Dictation', component: DictationSettings,
  args: { controller, page: 'models', locale: 'ru', onEnable: fn(async () => {}), onPage: fn() },
  parameters: { workshop: { width: 720, note: 'Каталог Handy 0.9.7. Здесь загрузки и запись заменены локальными примерами.' } },
  render: (args, context) => <div className="settings-panel" data-color-scheme={context.parameters.light ? 'light' : 'dark'} style={{ padding: 28, background: 'var(--surface-canvas)' }}><DictationSettings {...args} /></div>,
} satisfies Meta<typeof DictationSettings>
export default meta
type Story = StoryObj<typeof meta>
export const Models: Story = { name: 'Модели · русский язык' }
export const General: Story = { name: 'Микрофон и сочетание', args: { page: 'general' } }
export const History: Story = { name: 'История · пустое состояние', args: { page: 'history' } }
export const Welcome: Story = { name: 'Первое включение', args: { controller: { ...controller, data: null } } }
export const Downloading: Story = { name: 'Загрузка · 48%', args: { controller: { ...controller, busy: `download:${dictationModels[0].id}`, progress: { [dictationModels[0].id]: 48 } } } }
export const DownloadError: Story = { name: 'Загрузка · ошибка сети', args: { controller: { ...controller, error: 'Нет соединения с сервером. Проверьте подключение.' } } }
export const Light: Story = { name: 'Модели · светлая тема', parameters: { light: true } }
export const English: Story = { name: 'Models · English', args: { locale: 'en' } }
export const Dictionary: Story = { name: 'Словарь', args: { page: 'dictionary' } }
export const PostProcessing: Story = { name: 'Обработка текста · выключена', args: { page: 'processing' } }
export const Advanced: Story = { name: 'Дополнительные параметры', args: { page: 'advanced' } }
export const DownloadConsent: Story = { name: 'Перед загрузкой · путь и размер', play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  const trigger = canvas.getAllByRole('button', { name: 'Скачать' })[0]
  await userEvent.click(trigger)
  await expect(canvas.getByRole('dialog')).toHaveTextContent('AppData')
  await expect(canvas.getByRole('dialog')).toHaveTextContent(/МБ|ГБ|MB|GB/)
  // Synthetic keys do not trigger the browser's native dialog default action.
  // Exercise the same cancel event here; real Escape is covered in browser QA.
  fireEvent(canvas.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument()
  await expect(trigger).toHaveFocus()
  await userEvent.click(trigger)
} }
export const ImportPreview: Story = { name: 'Импорт · выбор файлов', play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: 'Импорт из Handy' }))
  const dialog = await canvas.findByRole('dialog')
  await expect(dialog).toHaveTextContent('История и ключи сервисов не переносятся')
  await expect(within(dialog).getByRole('button', { name: /Скопировать/ })).toBeDisabled()
} }

const rnnt = { ...gigaamRnnt, is_downloaded: true }
export const ImportedRnnt: Story = { name: 'Импортирована GigaAM · выбрана и выгружена', args: { controller: { ...controller, data: { ...controller.data!, models: [rnnt, ...dictationModels], settings: { ...dictationSettings, selected_model: rnnt.id }, modelStatus: { is_loaded: false, current_model: null } } } }, play: async ({ canvasElement }) => {
  const installed = within(canvasElement).getByRole('region', { name: 'На компьютере' })
  await expect(installed).toHaveTextContent('GigaAM')
  await expect(installed).not.toHaveTextContent('Скачана')
  await expect(installed).toHaveTextContent('Выбрана')
  await expect(installed).not.toHaveTextContent('В памяти')
} }
export const Disabled: Story = { name: 'Диктовка выключена · настройки доступны', args: { page: 'general', controller: { ...controller, enabled: false } } }
export const Recording: Story = { name: 'Идёт запись', args: { page: 'general', controller: { ...controller, data: { ...controller.data!, status: { revision: 1, operationId: 1, phase: 'recording', ready: true, text: '', error: null } } } } }
