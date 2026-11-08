import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test'
import { DictationSettings } from '../../features/dictation/DictationSettings'
import type { DictationController } from '../../app/useIslandApp'
import { dictationApi } from '../mocks/dictationApi'
import { dictationModels, dictationSettings, gigaamRnnt, parakeetEnglish } from '../dictationFixtures'
import { useState, type ComponentProps } from 'react'
import { defaultDictationAppearance } from '../../shared/lib/dictationAppearance'
function DictationWorkshop({ args, light }: { args: ComponentProps<typeof DictationSettings>; light: boolean }) {
  const [appearance, setAppearance] = useState(args.appearance ?? defaultDictationAppearance)
  const [showLatestMessage, setShowLatestMessage] = useState(args.showLatestMessage ?? false)
  const [words, setWords] = useState(args.controller.data?.settings.custom_words ?? [])
  const [processing, setProcessing] = useState(Boolean(args.controller.data?.settings.post_process_enabled))
  const c = args.controller
  const editable = c.data && (args.page === 'dictionary' || args.page === 'processing') ? {
    ...c,
    data: { ...c.data, settings: { ...c.data.settings, custom_words: words, post_process_enabled: processing } },
    api: {
      ...c.api,
      updateCustomWords: async (value: string[]) => { setWords(value); return null },
      changePostProcessEnabledSetting: async (value: boolean) => { setProcessing(value); return null },
    },
  } : c
  return <div className="settings-panel" data-color-scheme={light ? 'light' : 'dark'} data-reduced-motion={args.reducedMotion || undefined} style={{ padding: 'var(--space-6-5)', background: 'var(--surface-canvas)' }}><DictationSettings {...args} controller={editable}
    appearance={appearance} onAppearanceChange={setAppearance}
    showLatestMessage={showLatestMessage} onShowLatestMessage={args.onShowLatestMessage ? (checked) => { setShowLatestMessage(checked); args.onShowLatestMessage?.(checked) } : undefined} /></div>
}
const controller: DictationController = { enabled: true, api: dictationApi, busy: null, error: null, progress: {}, enable: fn(async () => {}), disable: fn(async () => {}), loadMoreHistory: fn(async () => {}), refresh: fn(async () => {}), run: fn(async (_id, action) => { await action() }), data: { settings: dictationSettings, models: [gigaamRnnt, parakeetEnglish, ...dictationModels], history: [], microphones: [{ index: '0', name: 'Microphone (USB Audio)', is_default: true }], path: 'C:\\Users\\User\\AppData\\Roaming\\Music Island\\dictation' } }
const meta = {
  title: 'Screens/Dictation', component: DictationSettings,
  args: { controller, page: 'models', locale: 'ru', onEnable: fn(async () => {}), onPage: fn() },
  parameters: { workshop: { width: 720, note: 'Каталог Handy 0.9.7. Здесь загрузки и запись заменены локальными примерами.' } },
  render: (args, context) => <DictationWorkshop key={context.id} args={args} light={Boolean(context.parameters.light)} />,
} satisfies Meta<typeof DictationSettings>
export default meta
type Story = StoryObj<typeof meta>
export const Models: Story = { name: 'Модели · русский язык' }
export const ModelsNarrow: Story = { name: 'Модели · узкое окно', parameters: { workshop: { width: 420 } } }
export const LanguageFilter: Story = { name: 'Модели · фильтр по языкам', play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  const trigger = canvas.getByRole('button', { name: 'Фильтр по языкам' })
  await expect(canvas.queryByRole('switch', { name: 'Показать все языки' })).not.toBeInTheDocument()
  await userEvent.click(trigger)
  const body = within(document.body)
  const options = body.getAllByRole('menuitemcheckbox')
  await expect(options[0]).toHaveTextContent('Английский')
  await expect(options[1]).toHaveTextContent('Русский')
  await userEvent.click(body.getByRole('menuitemcheckbox', { name: 'Английский' }))
  await expect(canvas.getByRole('article', { name: parakeetEnglish.name })).toBeVisible()
  await userEvent.click(body.getByRole('menuitemcheckbox', { name: 'Русский' }))
  await expect(canvas.queryByRole('article', { name: gigaamRnnt.name })).not.toBeInTheDocument()
  await expect(canvas.getByRole('article', { name: 'Whisper Small' })).toBeVisible()
  await userEvent.keyboard('{Escape}')
  await expect(body.queryByRole('menu')).not.toBeInTheDocument()
  await expect(trigger).toHaveFocus()
  await userEvent.click(trigger)
} }
export const LanguageFilterLight: Story = { ...LanguageFilter, name: 'Фильтр языков · светлая тема', parameters: { light: true } }
const readyController: DictationController = {
  ...controller,
  data: { ...controller.data!, models: [{ ...gigaamRnnt, is_downloaded: true }, ...dictationModels],
    settings: { ...dictationSettings, selected_model: gigaamRnnt.id } },
}
export const General: Story = { name: 'Микрофон и сочетание', args: { page: 'general', controller: readyController } }
export const GeneralNeedsModel: Story = { name: 'Основное · требуется модель', args: { page: 'general' } }
export const WaveTheme: Story = { name: 'Тема · волны и оптический материал', args: { page: 'general', appearance: { ...defaultDictationAppearance, theme: 'wave', palette: 'prism' } } }
export const WaveWhite: Story = { name: 'Волны · белый цвет', args: { page: 'general', appearance: { ...defaultDictationAppearance, theme: 'wave', palette: 'white' } } }
export const PixelTheme: Story = { name: 'Лиса · акцент приложения', args: { page: 'general', appearance: { ...defaultDictationAppearance, theme: 'pixels' } } }
export const FoxTheme: Story = { name: 'Тема · пиксельная лиса', args: { page: 'general', appearance: { ...defaultDictationAppearance, theme: 'pixels', palette: 'ember' } } }
export const FoxLight: Story = { ...FoxTheme, name: 'Пиксельная лиса · светлая тема', parameters: { light: true } }
export const FoxWhite: Story = { ...FoxTheme, name: 'Лиса · белый цвет', args: { ...FoxTheme.args, appearance: { ...defaultDictationAppearance, theme: 'pixels', palette: 'white' } } }
export const HoldPreview: Story = { ...FoxTheme, name: 'Удержание · превью без кнопок', args: { ...FoxTheme.args, controller: { ...controller, data: { ...controller.data!, settings: { ...dictationSettings, shortcut_activation: 'push_to_talk' } } } } }
export const ThemesNarrow: Story = { ...FoxTheme, name: 'Выбор тем · узкое окно', parameters: { workshop: { width: 420 } } }
export const ThemesReducedMotion: Story = { ...FoxTheme, name: 'Выбор тем · без движения', args: { ...FoxTheme.args, reducedMotion: true } }
export const ThemeSwitching: Story = { name: 'Темы · переключение и настройки', args: { page: 'general', reducedMotion: true }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  await expect(canvas.queryByRole('heading', { name: 'Тема диктовки' })).not.toBeInTheDocument()
  await expect(canvas.getByRole('radiogroup', { name: 'Тема диктовки' })).toBeVisible()
  await userEvent.click(canvas.getByRole('radio', { name: 'Лиса' }))
  await expect(canvasElement.querySelector('.dictation-preview [data-character="fox"]')).not.toBeNull()
  await expect(canvas.queryByRole('button', { name: 'Персонаж' })).not.toBeInTheDocument()
  await expect(canvas.queryAllByRole('slider')).toHaveLength(0)
  await expect(canvas.queryByRole('radio', { name: 'Спектр' })).not.toBeInTheDocument()
  await userEvent.click(canvas.getByRole('radio', { name: 'Белый' }))
  await expect(canvas.getByRole('radio', { name: 'Белый' })).toBeChecked()
  await userEvent.click(canvas.getByRole('radio', { name: 'Сакура' }))
  await expect(canvas.getByRole('radio', { name: 'Сакура' })).toBeChecked()
  await userEvent.click(canvas.getByRole('radio', { name: 'Волны' }))
  await expect(canvas.getByRole('switch', { name: 'Цветные края волн' })).toBeVisible()
  await userEvent.click(canvas.getByRole('radio', { name: 'Лиса' }))
  await expect(canvas.getByRole('radio', { name: 'Сакура' })).toBeChecked()
  await userEvent.click(canvas.getByRole('radio', { name: 'Классическая' }))
  await expect(canvas.queryByRole('radiogroup', { name: 'Цвет диктовки' })).not.toBeInTheDocument()
} }
export const History: Story = { name: 'История · пустое состояние', args: { page: 'history' } }
const historyExamples = [
  'Сверьте макеты с требованиями и подготовьте короткие итоги для команды.',
  'Обновить прототип перед встречей.',
  'Посмотреть, как работает новая настройка на узком экране.',
].map((transcription_text, index) => ({
  id: 100 - index, file_name: `preview-${index}.wav`, timestamp: 1794149400 - index * 1200, title: '',
  transcription_text, saved: index === 1, post_processed_text: null, post_process_prompt: null, post_process_requested: false,
}))
export const HistoryPopulated: Story = {
  name: 'История · карточки записей',
  args: { page: 'history', controller: { ...readyController, data: { ...readyController.data!, history: historyExamples } }, onShowLatestMessage: fn() },
}
const retryPreview = fn(async (_id: number) => null)
export const HistoryActions: Story = {
  ...HistoryPopulated,
  name: 'История · действия с записью',
  args: { ...HistoryPopulated.args, controller: { ...HistoryPopulated.args!.controller!,
    api: { ...readyController.api, retryHistoryEntryTranscription: retryPreview } } },
  play: async ({ canvasElement }) => {
    const first = within(canvasElement).getAllByRole('article')[0]
    await expect(first).toHaveTextContent(historyExamples[0].transcription_text)
    await userEvent.click(within(first).getByRole('button', { name: 'Распознать снова' }))
    await expect(retryPreview).toHaveBeenCalledWith(historyExamples[0].id)
  },
}
export const HistoryLatestMessage: Story = {
  ...HistoryPopulated,
  name: 'История · настройка островка',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('article')[0]).toHaveTextContent(historyExamples[0].transcription_text)
    const setting = canvas.getByRole('switch', { name: 'Последняя запись в островке' })
    await expect(setting).toHaveAccessibleDescription('Только при раскрытом островке.')
    await expect(setting).not.toBeChecked()
    await userEvent.click(setting)
    await expect(setting).toBeChecked()
    await expect(args.onShowLatestMessage).toHaveBeenCalledWith(true)
  },
}
export const Welcome: Story = { name: 'Первое включение', args: { controller: { ...controller, data: null } } }
export const Downloading: Story = { name: 'Загрузка · 48%', args: { controller: { ...controller, busy: `download:${dictationModels[0].id}`, progress: { [dictationModels[0].id]: 48 } } } }
export const DownloadError: Story = { name: 'Загрузка · ошибка сети', args: { controller: { ...controller, error: 'Нет соединения с сервером. Проверьте подключение.' } } }
export const Light: Story = { name: 'Модели · светлая тема', parameters: { light: true } }
export const English: Story = { name: 'Models · English', args: { locale: 'en' } }
export const Dictionary: Story = { name: 'Словарь', args: { page: 'dictionary' } }
export const DictionaryAddWord: Story = {
  name: 'Словарь · редактирование списка',
  args: { page: 'dictionary' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const field = canvas.getByRole('textbox', { name: 'Свои слова' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Вебвью{Enter}Гигаам{Enter}')
    await userEvent.tab()
    await expect(field).toHaveValue('Вебвью\nГигаам')
  },
}
export const PostProcessing: Story = { name: 'Обработка текста · выключена', args: { page: 'processing' } }
export const PostProcessingSetup: Story = {
  name: 'Обработка текста · раскрытие настроек',
  args: { page: 'processing' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('Подключение', { exact: true })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('switch', { name: 'Обработка с ИИ' }))
    await expect(canvas.getByText('Подключение', { exact: true })).toBeVisible()
    await expect(canvas.getByRole('group', { name: 'Диктовка с ИИ' })).toBeVisible()
  },
}
const changePreviewKey = fn(async (_id: string, _key: string) => null)
const changePreviewModel = fn(async (_id: string, _model: string) => null)
export const PostProcessingProvider: Story = {
  name: 'Обработка текста · подключение',
  args: { page: 'processing', controller: { ...readyController,
    api: { ...readyController.api, changePostProcessApiKeySetting: changePreviewKey,
      fetchPostProcessModels: async () => ['preview-model', 'another-model'], changePostProcessModelSetting: changePreviewModel },
    data: { ...readyController.data!, settings: { ...readyController.data!.settings, post_process_enabled: true,
      post_process_provider_id: 'preview', post_process_providers: [
        { id: 'preview', label: 'Preview', base_url: 'https://api.example.com/v1', models_endpoint: '/models' },
        { id: 'custom', label: 'Свой сервер', base_url: '', allow_base_url_edit: true },
      ],
      post_process_prompts: [{ id: 'clean', name: 'Очистить текст', prompt: '${output}' }, { id: 'summary', name: 'Краткий итог', prompt: '${output}' }],
      post_process_selected_prompt_id: 'clean' } },
  } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Очистить текст' })).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByRole('button', { name: 'Краткий итог' })).toHaveAttribute('aria-pressed', 'false')
    const configure = canvas.getByRole('button', { name: 'Настроить' })
    await userEvent.click(configure)
    const dialog = within(canvas.getByRole('dialog', { name: 'Подключение' }))
    await expect(dialog.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true')
    await expect(dialog.getByRole('button', { name: 'Свой сервер' })).toBeVisible()
    await expect(dialog.queryByRole('combobox')).not.toBeInTheDocument()
    await expect(dialog.getByLabelText('Ключ API', { selector: 'input' })).toHaveValue('')
    await userEvent.click(dialog.getByRole('button', { name: 'Удалить ключ' }))
    await expect(changePreviewKey).toHaveBeenCalledWith('preview', '')
    await userEvent.click(dialog.getByRole('button', { name: 'Загрузить список моделей' }))
    await userEvent.type(await dialog.findByRole('searchbox', { name: 'Найти модель ИИ' }), 'preview')
    await expect(dialog.queryByRole('button', { name: 'another-model' })).not.toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'preview-model' }))
    await expect(changePreviewModel).toHaveBeenCalledWith('preview', 'preview-model')
    await userEvent.click(dialog.getByRole('button', { name: 'Готово' }))
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument()
    await expect(configure).toHaveFocus()
  },
}
export const Advanced: Story = { name: 'Дополнительные параметры', args: { page: 'advanced' } }
const changeComputeBackend = fn(dictationApi.changeTranscribeAcceleratorSetting)
const vulkanController: DictationController = {
  ...controller,
  api: { ...dictationApi, getAvailableAccelerators: dictationApi.getAvailableAccelerators, getAvailableOutputDevices: dictationApi.getAvailableOutputDevices, changeTranscribeAcceleratorSetting: changeComputeBackend },
  data: {
    ...controller.data!,
    settings: { ...dictationSettings, transcribe_accelerator: 'vulkan' },
    modelStatus: { is_loaded: true, current_model: gigaamRnnt.id, backend: 'Vulkan0' },
  },
}
export const AdvancedVulkan: Story = {
  name: 'Вычисления · Vulkan и видеокарта',
  args: { page: 'advanced', controller: vulkanController },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('button', { name: 'Видеокарта' })).toBeVisible()
    await expect(canvas.getByText('Движок в работе')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Движок GGML / GGUF' }))
    await userEvent.click(within(document.body).getByRole('option', { name: 'CPU' }))
    await expect(changeComputeBackend).toHaveBeenCalledWith('cpu')
  },
}
export const AdvancedVulkanUnavailable: Story = {
  name: 'Вычисления · Vulkan недоступен',
  args: {
    page: 'advanced',
    controller: {
      ...vulkanController,
      api: { ...vulkanController.api, getAvailableAccelerators: async () => ({ transcribe: ['auto', 'cpu'], ort: ['cpu'], gpu_devices: [] }) },
      data: { ...vulkanController.data!, modelStatus: { is_loaded: true, current_model: gigaamRnnt.id, backend: 'CPU' } },
    },
  },
}
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
  await userEvent.click(canvas.getByRole('button', { name: 'Добавить модель' }))
  await userEvent.click(within(document.body).getByRole('menuitem', { name: 'Импорт из Handy' }))
  const dialog = await canvas.findByRole('dialog')
  await expect(dialog).toHaveTextContent('История и ключи сервисов не переносятся')
  await expect(within(dialog).getByRole('button', { name: /Скопировать/ })).toBeDisabled()
} }

const rnnt = { ...gigaamRnnt, is_downloaded: true }
export const ImportedRnnt: Story = { name: 'Импортирована GigaAM · выбрана и выгружена', args: { controller: { ...controller, data: { ...controller.data!, models: [rnnt, ...dictationModels], settings: { ...dictationSettings, selected_model: rnnt.id }, modelStatus: { is_loaded: false, current_model: null } } } }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  const installed = canvas.getByRole('article', { name: rnnt.name })
  await expect(canvas.queryByRole('heading', { name: 'На компьютере' })).not.toBeInTheDocument()
  await expect(installed).toHaveTextContent('Скачано')
  await expect(installed).toHaveTextContent('Выбрана')
  await expect(installed).not.toHaveTextContent('В памяти')
} }
export const Disabled: Story = { name: 'Диктовка выключена · настройки доступны', args: { page: 'general', controller: { ...controller, enabled: false } } }
export const DisabledLight: Story = { ...Disabled, name: 'Диктовка выключена · светлая тема', parameters: { light: true } }
export const Recording: Story = { name: 'Идёт запись', args: { page: 'general', controller: { ...readyController, data: { ...readyController.data!, status: { revision: 1, operationId: 1, phase: 'recording', ready: true, text: '', error: null } } } } }
export const AdvancedLight: Story = { name: 'Дополнительно · светлая тема', args: { page: 'advanced' }, parameters: { light: true } }
export const AdvancedEnglish: Story = { name: 'Дополнительно · английский', args: { page: 'advanced', locale: 'en' } }
export const AdvancedNarrow: Story = { name: 'Дополнительно · узкое окно', args: { page: 'advanced' }, parameters: { workshop: { width: 420 } } }
export const AdvancedLoadError: Story = { name: 'Дополнительно · устройства недоступны', args: { page: 'advanced', controller: { ...controller, api: { ...dictationApi, getAvailableOutputDevices: fn(async () => { throw new Error('Unavailable') }), getAvailableAccelerators: fn(async () => { throw new Error('Unavailable') }) } } } }
export const AdvancedLoading: Story = { name: 'Дополнительно · загрузка устройств', args: { page: 'advanced', controller: { ...controller, api: { ...dictationApi, getAvailableOutputDevices: fn(async () => { await new Promise(() => {}); return dictationApi.getAvailableOutputDevices() }), getAvailableAccelerators: fn(async () => { await new Promise(() => {}); return dictationApi.getAvailableAccelerators() }) } } } }
export const GeneralLight: Story = { name: 'Превью диктовки · светлая тема', args: { page: 'general', reducedMotion: true }, parameters: { light: true } }
export const MicrophoneDiagnostic: Story = { name: 'Диагностика · микрофон доступен', args: { page: 'advanced' }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: 'Проверить микрофон' }))
  await expect(await canvas.findByText('Доступ к микрофону разрешён')).toBeVisible()
  await userEvent.click(canvas.getByText('Технические данные'))
  await expect(canvas.getByText(/"overall_access": "allowed"/)).toBeVisible()
} }
