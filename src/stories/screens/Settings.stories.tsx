import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { useGlobals } from 'storybook/preview-api'
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test'
import { SettingsReadError, SettingsWindow } from '../../features/settings/SettingsWindow'
import { SettingsPanel } from '../../features/settings/SettingsPanel'
import { artworkCssColors, readArtworkPalette } from '../../features/overlay/artworkPalette'
import { APPEARANCE_PREVIEW_MEDIA } from '../../features/settings/previewMedia'
import { getDefaultConfig } from '../../app/tauriApi'
import type { AppConfig, Locale } from '../../shared/lib/types'
import { previewReducedTransparency } from '../mocks/reducedTransparency'
import { normalizeInterfaceTheme, type InterfaceThemeId } from '../../shared/lib/interfaceTheme'
import { health } from '../fixtures'
import { useWorkshopConfig } from '../useWorkshopConfig'
import { useUsageController } from '../../app/usage/useUsageController'

// React state belongs to a React component. A delayed native-preview save can
// rerender this component without reentering the Storybook preview-hook context.
function SettingsPreview({
  args,
  locale,
  accent,
  onPreviewChange,
  reducedMotion = false,
  preferredSourceAppId,
  scrollViewportHeight,
  interfaceTheme,
}: {
  args: ComponentProps<typeof SettingsPanel>
  locale: Locale
  accent: string
  onPreviewChange: (config: AppConfig) => void
  reducedMotion?: boolean
  preferredSourceAppId?: string
  scrollViewportHeight?: number
  interfaceTheme: InterfaceThemeId
}) {
  const [config, setConfig] = useWorkshopConfig(locale, accent, false, interfaceTheme)
  const usage = useUsageController()
  const configuredPreview = preferredSourceAppId
    ? { ...config, media: { ...config.media, protocol: 'smtc' as const, preferredSourceAppId } }
    : config
  const panel = <SettingsPanel
        {...args}
        usage={usage}
        config={reducedMotion ? { ...configuredPreview, appearance: { ...configuredPreview.appearance, reducedMotion: true } } : configuredPreview}
        onChange={async (next) => {
          await args.onChange(next)
          setConfig(next)
          onPreviewChange(next)
        }}
      />
  return <div style={{ height: scrollViewportHeight ?? 754 }}>
    <SettingsWindow locale={locale} reducedMotion={reducedMotion || configuredPreview.appearance.reducedMotion}>
      {panel}
    </SettingsWindow>
  </div>
}

const meta = {
  title: 'Screens/Settings',
  component: SettingsPanel,
  args: {
    config: getDefaultConfig(),
    smtcHealth: health,
    mediaSessions: [
      {
        sourceAppId: 'YandexMusic.exe',
        playbackStatus: 'playing',
        isCurrent: true,
      },
      {
        sourceAppId: 'Spotify.exe',
        playbackStatus: 'paused',
        isCurrent: false,
      },
    ],
    onChange: fn().mockName('settings.change'),
    onCopyDiagnostics: fn().mockName('diagnostics.copy'),
    onRefreshSources: fn().mockName('sources.refresh'),
  },
  parameters: {
    handlesInterfaceTheme: true,
    workshop: {
      width: 860,
      note: 'Настройки работают в памяти этого примера. Можно переключаться между Music Island и Better Voice. Нативные подключения не запускаются.',
    },
    controls: { exclude: ['config'] },
  },
  render: function Settings(args, context) {
    const [, updateGlobals] = useGlobals()
    return (
      <SettingsPreview
        args={args}
        locale={context.globals.locale}
        accent={context.globals.accent}
        reducedMotion={context.parameters.reducedMotion === true}
        interfaceTheme={normalizeInterfaceTheme(context.globals.interfaceTheme)}
        preferredSourceAppId={context.parameters.preferredSourceAppId as string | undefined}
        scrollViewportHeight={context.parameters.scrollViewportHeight as number | undefined}
        onPreviewChange={(next) => {
          if (
            next.appearance.locale !== context.globals.locale ||
            next.appearance.accentColor !== context.globals.accent
          ) {
            updateGlobals({
              locale: next.appearance.locale,
              accent: next.appearance.accentColor,
            })
          }
        }}
      />
    )
  },
} satisfies Meta<typeof SettingsPanel>
export default meta
type Story = StoryObj<typeof meta>

const rereadProfile = fn()
export const UnreadableProfile: Story = {
  name: 'Ошибка чтения файла настроек',
  parameters: { workshop: { width: 620, height: 480 } },
  render: (_args, { globals }) => <div style={{ height: 480 }}>
    <SettingsWindow locale={globals.locale}>
      <SettingsReadError locale={globals.locale} onRetry={rereadProfile} />
    </SettingsWindow>
  </div>,
  play: async ({ canvas, globals }) => {
    const alert = canvas.getByRole('alert')
    const bounds = alert.getBoundingClientRect()
    const scroll = alert.parentElement!.getBoundingClientRect()
    await expect(bounds.height).toBeLessThan(scroll.height / 2)
    await expect(bounds.right).toBeLessThan(scroll.right)
    await userEvent.click(canvas.getByRole('button', { name: globals.locale === 'ru' ? 'Прочитать снова' : 'Read again' }))
    await expect(rereadProfile).toHaveBeenCalled()
  },
}
export const Default: Story = { name: 'Настройки приложения' }
export const Classic: Story = { name: 'Классическая · тёмное оформление', globals: { interfaceTheme: 'classic' } }
export const Glass: Story = { name: 'Стекло · тёмное оформление', globals: { interfaceTheme: 'glass' } }
export const AdvancedSurfaceEditor: Story = {
  ...Glass, name: 'Стекло · редактор поверхностей',
  globals: { interfaceTheme: 'glass', locale: 'ru' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('switch', { name: 'Продвинутые настройки' })).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'О программе' }))
    await userEvent.click(canvas.getByRole('switch', { name: 'Режим разработчика' }))
    await userEvent.click(canvas.getByRole('switch', { name: 'Продвинутые настройки' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Внешний вид' }))
    const editor = within(canvasElement.querySelector<HTMLElement>('.settings-appearance .glass-editor')!)
    await expect(editor.getByRole('switch', { name: 'Продвинутые настройки' })).toBeChecked()
    await expect(editor.getByRole('button', { name: 'Скопировать JSON' })).toBeEnabled()
    await userEvent.click(editor.getByText('Корпус островка'))
    const body = within(await editor.findByRole('group', { name: 'Корпус островка' }))
    await expect(body.queryByRole('slider', { name: 'Интенсивность кромки' })).toBeNull()
    await fireEvent.change(body.getByRole('slider', { name: 'Размытие' }), { target: { value: '0' } })
    canvas.getByText('Параметры стекла').closest('details')!.open = true
    const material = within(canvas.getByRole('group', { name: 'Параметры стекла' }))
    await expect(material.getByText(/У корпуса своё размытие \(0 px\)/)).toBeVisible()
    await expect(material.getByRole('slider', { name: 'Размытие фона' })).toHaveValue('85')
    await userEvent.click(body.getByRole('button', { name: 'Сбросить «Размытие»' }))
    await expect(material.queryByText(/У корпуса своё размытие/)).toBeNull()
    await userEvent.click(editor.getByText('Корпус островка'))
    await userEvent.click(editor.getByText('Заливка прогресса'))
    const group = await editor.findByRole('group', { name: 'Заливка прогресса' })
    const controls = within(group)
    const angle = controls.getByRole('slider', { name: 'Угол градиента' })
    const start = controls.getByLabelText('Начало градиента')
    await fireEvent.change(angle, { target: { value: '135' } })
    await fireEvent.change(start, { target: { value: '#ff9950' } })
    await expect(angle).toHaveValue('135')
    await expect(start).toHaveValue('#ff9950')
    await userEvent.click(controls.getByRole('button', { name: 'Сбросить «Угол градиента»' }))
    await expect(angle).toHaveValue('90')
    await expect(start).toHaveValue('#ff9950')
    const toggle = editor.getByRole('switch', { name: 'Продвинутые настройки' })
    await userEvent.click(toggle)
    await expect(editor.queryByText('Заливка прогресса')).toBeNull()
    await userEvent.click(toggle)
    await userEvent.click(editor.getByText('Заливка прогресса'))
    const reopened = await editor.findByRole('group', { name: 'Заливка прогресса' })
    await expect(within(reopened).getByLabelText('Начало градиента')).toHaveValue('#ff9950')
    const reset = within(reopened).getByRole('button', { name: 'Сбросить группу' })
    await userEvent.click(reset)
    await expect(reset).toBeDisabled()
    await expect(editor.queryByText('Кнопки капсулы')).toBeNull()
    reopened.scrollIntoView({ block: 'center' })
  },
}
export const DesktopGlassEffect: Story = {
  ...Glass, name: 'Стекло · выбор эффекта Windows',
  globals: { interfaceTheme: 'glass', locale: 'ru' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'О программе' }))
    await userEvent.click(canvas.getByRole('switch', { name: 'Режим разработчика' }))
    await userEvent.click(canvas.getByRole('switch', { name: 'Продвинутые настройки' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Внешний вид' }))
    await userEvent.click(await canvas.findByText('Корпус островка'))
    const effect = await canvas.findByRole('button', { name: 'Эффект стекла' })
    const select = async (name: string) => {
      await userEvent.click(effect)
      await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole('option', { name }))
    }
    await expect(effect).toHaveTextContent('GPU-линза')
    const bend = await canvas.findByRole('slider', { name: 'Преломление' })
    await fireEvent.change(bend, { target: { value: '70' } })
    await expect(bend).toHaveValue('70')
    await select('Системное стекло')
    await expect(canvas.queryByRole('slider', { name: 'Дисперсия' })).toBeNull()
    await select('GPU-линза для записи')
    await expect(await canvas.findByRole('slider', { name: 'Преломление' })).toHaveValue('70')
    await expect(canvas.getByText('Островок виден в записи. Снимок фона обновляется при каждом открытии.')).toBeInTheDocument()
  },
}
export const MaterialAtMinimumSize: Story = {
  name: 'Выбор темы · минимальное окно Windows',
  globals: { interfaceTheme: 'glass', locale: 'ru' },
  parameters: { scrollViewportHeight: 480, workshop: { width: 620 }, a11y: { test: 'error' } },
  play: async ({ canvasElement }) => {
    const appearance = canvasElement.querySelector<HTMLElement>('.settings-appearance')!
    const editor = appearance.querySelector('.island-layout-editor')!
    const theme = within(appearance).getByRole('group', { name: 'Тема островка' })
    await expect(editor.compareDocumentPosition(theme) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await expect(editor.getBoundingClientRect().top).toBeLessThan(appearance.closest('[data-settings-scroll]')!.getBoundingClientRect().bottom)
    theme.scrollIntoView({ block: 'nearest' })
    await expect(within(theme).getByRole('radio', { name: 'Стекло' })).toBeChecked()
    await expect(appearance.scrollWidth).toBeLessThanOrEqual(appearance.clientWidth + 1)
    await expect(within(appearance).getByRole('switch', { name: 'Фон при воспроизведении' }).closest('details')).toBeNull()
    const tuning = within(appearance).getByText('Параметры стекла').closest('details')!
    await expect(tuning.open).toBe(false)
    await expect(tuning.querySelector('summary')!.getBoundingClientRect().height).toBeGreaterThanOrEqual(32)
  },
}
export const GlassPlaybackBackground: Story = {
  ...Glass, name: 'Стекло · отключение и включение фона',
  globals: { interfaceTheme: 'glass', locale: 'ru' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByRole('switch', { name: 'Фон при воспроизведении' })
    await expect(toggle).toBeChecked()
    const previewWave = () => canvasElement.querySelector('.island-preview__body [data-playback-wave]')
    await expect(previewWave()).toBeInTheDocument()
    await userEvent.click(toggle)
    await expect(toggle).not.toBeChecked()
    await waitFor(() => expect(previewWave()).toBeNull())
    await expect(canvasElement.querySelector('.island-preview__body .island-particles')).toBeInTheDocument()
    await userEvent.click(toggle)
    await expect(toggle).toBeChecked()
    await waitFor(() => expect(previewWave()).toBeInTheDocument())
  },
}
export const GlassMaterialTuning: Story = {
  ...Glass, name: 'Стекло · настройка материала',
  globals: { interfaceTheme: 'glass', locale: 'ru' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.querySelector<HTMLElement>('.settings-appearance')!)
    const disclosure = () => canvas.getByText('Параметры стекла').closest('summary')!
    await expect(disclosure()).toHaveTextContent('По умолчанию')
    await userEvent.click(disclosure())
    const controls = within(canvas.getByRole('group', { name: 'Параметры стекла' }))
    const preview = canvasElement.querySelector<HTMLElement>('.island-preview .island-root')!
    const transparency = controls.getByRole('slider', { name: 'Прозрачность' })
    const frost = controls.getByRole('slider', { name: 'Размытие фона' })
    const parallax = controls.getByRole('slider', { name: 'Параллакс' })
    await expect(controls.getAllByRole('slider')).toHaveLength(5)
    await expect(transparency).toBeVisible()
    await expect(controls.getByRole('button', { name: 'Сбросить параметры стекла' })).toBeDisabled()
    await fireEvent.change(transparency, { target: { value: '82' } })
    await fireEvent.change(frost, { target: { value: '0' } })
    await fireEvent.change(parallax, { target: { value: '0' } })
    await waitFor(() => {
      expect(preview.style.getPropertyValue('--glass-transparency-strength')).toBe('0.82')
      expect(preview.style.getPropertyValue('--glass-user-filter')).toBe('none')
      expect(preview.style.getPropertyValue('--glass-parallax-strength')).toBe('0')
    })
    await expect(disclosure()).toHaveTextContent('Свои значения')
    await userEvent.click(disclosure())
    await expect(transparency).not.toBeVisible()
    await userEvent.click(canvas.getByRole('radio', { name: 'Классическая' }))
    await expect(canvas.queryByText('Параметры стекла')).toBeNull()
    await userEvent.click(canvas.getByRole('radio', { name: 'Стекло' }))
    await expect(disclosure()).toHaveTextContent('Свои значения')
    await userEvent.click(disclosure())
    await expect(canvas.getByRole('slider', { name: 'Прозрачность' })).toHaveValue('82')
    await userEvent.click(canvas.getByRole('button', { name: 'Сбросить параметры стекла' }))
    await expect(disclosure()).toHaveTextContent('По умолчанию')
    await expect(canvas.getByRole('slider', { name: 'Прозрачность' })).toHaveValue('90')
    await expect(canvas.getByRole('slider', { name: 'Размытие фона' })).toHaveValue('85')
    await expect(canvas.getByRole('slider', { name: 'Параллакс' })).toHaveValue('91')
    await expect(canvas.getByRole('slider', { name: 'Яркость блика' })).toHaveValue('42')
    await expect(canvas.getByRole('slider', { name: 'Толщина кромки кнопок' })).toHaveValue('50')
    canvas.getByRole('group', { name: 'Параметры стекла' }).scrollIntoView({ block: 'center' })
  },
}
export const GlassScopes: Story = {
  ...Glass,
  name: 'Стекло · состояния верхнего меню',
  globals: { interfaceTheme: 'glass', locale: 'ru' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const voice = canvas.getByRole('button', { name: /Better Voice/ })
    voice.focus()
    await userEvent.keyboard('{Enter}')
    await expect(voice).toHaveFocus()
    await expect(voice).toHaveAttribute('aria-pressed', 'true')
    await expect(voice.querySelector('.settings-selection-marker')).toBeInTheDocument()
    const dictation = canvas.getByRole('button', { name: /^Диктовка$/ })
    await userEvent.click(dictation)
    await expect(voice).toHaveAttribute('aria-pressed', 'false')
    await expect(dictation).toHaveAttribute('aria-pressed', 'true')
  },
}
export const GlassAccessible: Story = {
  name: 'Стекло · узкое окно без прозрачности и анимации',
  globals: { interfaceTheme: 'glass', locale: 'en' },
  parameters: { reducedMotion: true, workshop: { width: 360 } },
  beforeEach: previewReducedTransparency,
}
export const ThemeSwitch: Story = {
  name: 'Тема и палитра меняют только островок',
  globals: { interfaceTheme: 'classic', locale: 'ru' },
  play: async ({ canvas, canvasElement, args }) => {
    const windowRoot = canvasElement.querySelector('.settings-window-root')!
    const sidebar = canvasElement.querySelector('.settings-navigation')!
    const panel = canvasElement.querySelector('.island-appearance-options')!
    const shellStyle = () => [getComputedStyle(windowRoot).backgroundColor, getComputedStyle(panel).padding,
      getComputedStyle(panel).backgroundColor, getComputedStyle(sidebar).fontFamily, getComputedStyle(sidebar).color]
    const before = shellStyle()
    const island = () => canvasElement.querySelector('.island-preview .island-root')!
    const backdrop = canvasElement.querySelector('.island-preview')!
    const foxes = await waitFor(() => {
      const foxes = backdrop.querySelector('canvas[data-ascii-scene="fox"]')
      expect(foxes).toBeInTheDocument()
      return foxes
    })
    const cover = await readArtworkPalette(APPEARANCE_PREVIEW_MEDIA.thumbnailDataUrl!)
    expect(cover).not.toBeNull()
    const classic = canvas.getByRole('radio', { name: 'Классическая' })
    const glass = canvas.getByRole('radio', { name: 'Стекло' })
    await expect(classic).toBeChecked()
    await expect(island()).toHaveStyle({ '--artwork-primary': artworkCssColors(cover, false).primary })
    classic.focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(glass).toBeChecked()
    await expect(island()).toHaveAttribute('data-interface-theme', 'glass')
    await expect(island()).toHaveStyle({ '--artwork-primary': artworkCssColors(cover, true).primary })
    await expect(backdrop.querySelector('canvas')).toBe(foxes)
    await expect(canvas.getByRole('switch', { name: 'Фон при воспроизведении' })).toBeVisible()
    await userEvent.click(canvas.getByRole('radio', { name: 'Океан' }))
    await waitFor(() => expect(island()).toHaveAttribute('data-interface-palette', 'ocean'))
    await expect(shellStyle()).toEqual(before)
    await userEvent.click(classic)
    await expect(island()).toHaveAttribute('data-interface-theme', 'classic')
    await expect(canvas.queryByRole('switch', { name: 'Фон при воспроизведении' })).toBeNull()
    await expect(canvas.getByRole('slider', { name: 'Задержка открытия' })).toBeVisible()
    await waitFor(() => expect(args.onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      plugins: expect.objectContaining({ settings: expect.objectContaining({
        ui: expect.objectContaining({ interfaceTheme: 'classic', interfacePalette: 'ocean' }),
      }) }),
    })))
  },
}
export const PreviewReadouts: Story = { name: 'Превью · контраст ширины и масштаба', play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  for (const [page, selector] of [['Внешний вид', '.settings-appearance'], ['Панель задач', '.settings-taskbar'], ['Лимиты ИИ', '.settings-usage-page']]) {
    await userEvent.click(canvas.getByRole('button', { name: page }))
    await waitFor(() => expect(canvas.getByRole('heading', { name: page })).toBeVisible())
    // Other editors remain mounted but hidden to retain their local state.
    const pageRoot = canvasElement.querySelector<HTMLElement>(selector)!
    const main = selector === '.settings-appearance'
    const grip = pageRoot.querySelector<HTMLElement>(main ? '.island-preview__resize-edge--right' : '.preview-resize-handle')!
    const readout = grip.dataset.readout ?? ''
    await expect(readout.startsWith(main ? 'Ширина ' : 'Масштаб ') && readout.endsWith('%')).toBe(true)
    await expect(pageRoot.querySelector('.preview-scale__value, .preview-dimensions')).toBeNull()
    await expect(getComputedStyle(grip, '::before').opacity).toBe('0')
    await expect(getComputedStyle(grip, '::before').backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  }
} }
export const PreviewReadoutsNarrow: Story = { ...PreviewReadouts, name: 'Превью · подписи в узком окне', parameters: { workshop: { width: 420 } } }
export const ShaderRetention: Story = { name: 'Навигация · один canvas', play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  await waitFor(() => expect(canvasElement.querySelector('.warp-shared-host canvas')).not.toBeNull())
  const renderer = canvasElement.querySelector('.warp-shared-host canvas')
  for (const page of ['Панель задач', 'Лимиты ИИ', 'Внешний вид', 'Панель задач']) {
    await userEvent.click(canvas.getByRole('button', { name: page }))
    await expect(canvasElement.querySelector('.warp-shared-host canvas')).toBe(renderer)
  }
  await userEvent.click(canvas.getByRole('button', { name: 'Better Voice Бета' }))
  await waitFor(() => expect(canvasElement.querySelector('.voice-atmosphere canvas')).toBe(renderer))
  await userEvent.click(canvas.getByRole('button', { name: 'Music Island' }))
  await expect(canvasElement.querySelector('.warp-shared-host canvas')).toBe(renderer)
} }
export const ScopeStartsAtFirstPage: Story = { name: 'Раздел открывается с первого пункта', play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  const scopes = within(canvas.getByRole('group', { name: 'Раздел настроек' }))
  await userEvent.click(canvas.getByRole('button', { name: 'Панель задач' }))
  await userEvent.click(scopes.getByRole('button', { name: 'Диктовка' }))
  await userEvent.click(canvas.getByRole('button', { name: 'Модели' }))
  await userEvent.click(scopes.getByRole('button', { name: 'Music Island' }))
  await expect(canvas.getByRole('button', { name: 'Внешний вид' })).toHaveAttribute('aria-current', 'page')
  await userEvent.click(scopes.getByRole('button', { name: 'Диктовка' }))
  await expect(canvas.getByRole('button', { name: 'Основное' })).toHaveAttribute('aria-current', 'page')
  await userEvent.click(scopes.getByRole('button', { name: /Better Voice/ }))
  await userEvent.click(canvas.getByRole('button', { name: 'Подключение' }))
  await userEvent.click(scopes.getByRole('button', { name: 'Music Island' }))
  await userEvent.click(scopes.getByRole('button', { name: /Better Voice/ }))
  await expect(canvas.getByRole('button', { name: 'Микрофон и эффекты' })).toHaveAttribute('aria-current', 'page')
} }
export const DictationNavigation: Story = { name: 'Диктовка · единая оболочка', play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  await userEvent.click(within(canvas.getByRole('group', { name: 'Раздел настроек' })).getByRole('button', { name: 'Диктовка' }))
  await expect(await canvas.findByRole('switch', { name: 'Диктовка' })).toHaveAttribute('aria-checked', 'false')
  await userEvent.click(canvas.getByRole('button', { name: 'Модели' }))
  await canvas.findByRole('heading', { name: 'Модели' })
  await userEvent.click(canvas.getByRole('button', { name: 'Дополнительно' }))
  await waitFor(() => expect(canvas.getByRole('heading', { name: 'Запись' })).toBeVisible())
  const scroller = canvasElement.querySelector<HTMLElement>('[data-settings-scroll]')!
  await waitFor(() => expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight))
  const offset = Math.min(600, scroller.scrollHeight - scroller.clientHeight)
  scroller.scrollTop = offset
  await userEvent.click(canvas.getByRole('button', { name: 'Дополнительно' }))
  await expect(scroller.scrollTop).toBe(offset)
  await userEvent.click(canvas.getByRole('button', { name: 'Модели' }))
  await expect(scroller.scrollTop).toBe(0)
} }
export const AssistantLimits: Story = {
  name: 'Подключение лимитов ИИ',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^(Лимиты ИИ|AI limits)$/ }))
    await userEvent.click(canvas.getAllByRole('button', { name: /^(Подключить|Connect)$/ })[0])
    await waitFor(() => expect(canvas.getByRole('button', { name: /^(Отключить|Disconnect)$/ })).toBeEnabled())
    await expect(canvas.getAllByText(/72%/).length).toBeGreaterThan(0)
  },
}
export const AppearanceDark: Story = {
  name: 'Внешний вид · тёмное оформление',
}
export const LocalServersToggle: Story = {
  name: 'Добавление и удаление виджета локальных серверов',
  play: async ({ canvasElement, args }) => {
    const widget = (zone: 'bottom' | 'widgetCatalog') => canvasElement.querySelector<HTMLElement>(`[data-layout-target="${zone}"] [data-layout-element="localServers"]`)
    const expectSaved = (localServersEnabled: boolean) => waitFor(() => expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ plugins: expect.objectContaining({
        settings: expect.objectContaining({ ui: expect.objectContaining({ localServersEnabled }) }),
      }) }),
    ))
    await expect(widget('widgetCatalog')).toBeInTheDocument()
    widget('widgetCatalog')!.focus()
    await userEvent.keyboard(' {ArrowRight}{Enter}')
    await expect(widget('bottom')).toBeInTheDocument()
    await expectSaved(true)
    widget('bottom')!.focus()
    await userEvent.keyboard(' {ArrowLeft}{Enter}')
    await expect(widget('widgetCatalog')).toBeInTheDocument()
    await expectSaved(false)
  },
}
export const ResetKeepsConnectedLimits: Story = {
  name: 'Сброс островка сохраняет подключённые лимиты',
  play: async (context) => {
    await AssistantLimits.play?.(context)
    const canvas = within(context.canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^(Внешний вид|Appearance)$/ }))
    const codex = () => context.canvasElement.querySelector('[data-layout-target="left"] [data-layout-element="codex"]')
    await expect(codex()).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: /^(Сбросить настройки островка|Reset island settings)$/ }))
    await waitFor(() => expect(context.args.onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      plugins: expect.objectContaining({ settings: expect.objectContaining({ usage: expect.objectContaining({ codexEnabled: true }) }) }),
    })))
    await expect(codex()).toBeInTheDocument()
  },
}
export const HeaderDark: Story = {
  name: 'Шапка · тёмное оформление',
  parameters: { workshop: { width: 860, height: 360 } },
}
export const AppearanceNarrow: Story = {
  name: 'Внешний вид · узкое окно',
  parameters: { workshop: { width: 420 } },
}
export const AppearanceInteraction: Story = {
  name: 'Внешний вид · живой предпросмотр',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const preview = canvasElement.querySelector<HTMLElement>('.island-preview')!
    const scene = preview.querySelector<HTMLElement>('.island-preview__frame')!
    const island = preview.querySelector<HTMLElement>('.island-card')!
    const width = canvas.getAllByRole('slider', { name: /^(Ширина островка|Island width)$/ })[0]

    await expect(preview).toBeInTheDocument()
    await expect(island).toBeInTheDocument()
    await expect(canvas.getByRole('heading', { level: 2, name: /^(Внешний вид|Appearance)$/ })).toBeVisible()

    width.focus()
    await userEvent.keyboard('{Home}{ArrowRight}')
    await waitFor(() => {
      expect(width).toHaveAttribute('aria-valuenow', '81')
      expect(scene.style.getPropertyValue('--island-width')).toBe('0.81')
    })
  },
}
export const DeepScrollNavigation: Story = {
  name: 'Навигация после глубокой прокрутки',
  parameters: { scrollViewportHeight: 620, workshop: { width: 860, height: 880 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const scroller = canvasElement.querySelector<HTMLElement>('[data-settings-scroll]')!
    scroller.scrollTop = Math.min(240, scroller.scrollHeight - scroller.clientHeight)
    await waitFor(() => expect(scroller.scrollTop).toBeGreaterThan(0))

    const appearance = canvas.getByRole('button', { name: /^(Внешний вид|Appearance)$/ })
    const deepPosition = scroller.scrollTop
    // A synthetic same-page click isolates hook behavior; browser focus may
    // independently scroll a deeply off-screen active navigation button.
    fireEvent.click(appearance)
    await expect(scroller.scrollTop).toBe(deepPosition)

    const about = canvas.getByRole('button', { name: /^(О программе|About)$/ })
    await userEvent.click(about)
    await waitFor(() => {
      expect(about).toHaveAttribute('aria-current', 'page')
      expect(scroller.scrollTop).toBe(0)
    })
  },
}
export const DeepScrollNavigationReducedMotion: Story = {
  ...DeepScrollNavigation,
  name: 'Навигация после прокрутки · без движения',
  parameters: { ...DeepScrollNavigation.parameters, reducedMotion: true },
}
export const Taskbar: Story = {
  name: 'Мини-плеер в панели задач',
  play: async ({ canvasElement, args, parameters }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^(Панель задач|Taskbar)$/ }))
    await waitFor(() => expect(canvas.getByRole('heading', { level: 2, name: /^(Панель задач|Taskbar)$/ })).toBeVisible())
    const toggle = () => canvas.getByRole('switch', { name: /^(Мини-плеер|Taskbar mini-player)$/ })
    await expect(toggle()).not.toBeChecked()
    await userEvent.click(toggle())
    await waitFor(() => expect(args.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ taskbar: expect.objectContaining({ enabled: true }), media: args.config.media }),
    ))
    await waitFor(() => expect(toggle()).toBeChecked())
    if (parameters.reducedMotion === true) {
      await waitFor(() => {
        expect(canvasElement.querySelector('.taskbar-preview__material .warp-material')).toHaveAttribute('data-speed', '0')
        expect(canvasElement.querySelector('.taskbar-preview__material .warp-material')).toHaveAttribute('data-motion', 'paused')
      })
    }
    const size = canvas.getByRole('slider', { name: /^(Масштаб мини-плеера|Mini-player scale)/ })
    size.focus()
    await userEvent.keyboard('{End}')
    await waitFor(() => expect(args.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ taskbar: expect.objectContaining({ enabled: true, scale: 1.25 }) }),
    ))
    await userEvent.click(toggle())
    await waitFor(() => expect(args.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ taskbar: expect.objectContaining({ enabled: false, scale: 1.25 }) }),
    ))
    await waitFor(() => expect(toggle()).not.toBeChecked())
  },
}
export const TaskbarReducedMotion: Story = {
  ...Taskbar,
  name: 'Панель задач · без движения',
  parameters: { reducedMotion: true },
}
export const NoSources: Story = {
  name: 'Нет источников',
  args: { mediaSessions: [], smtcHealth: { ...health, sessionCount: 0 } },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^(Источник музыки|Music source)$/ }))
  },
}
export const AutostartError: Story = {
  name: 'Ошибка автозапуска',
  args: { autostartError: 'Не удалось включить автозапуск.' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^(Система|System)$/ }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Не удалось включить автозапуск.')
  },
}
export const GlassAutostartError: Story = { ...AutostartError, name: 'Стекло · ошибка автозапуска', globals: { interfaceTheme: 'glass' } }
export const GlassTaskbarError: Story = {
  name: 'Стекло · мини-плеер недоступен',
  globals: { interfaceTheme: 'glass' },
  parameters: { nativePreview: { taskbar: { state: 'error' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^(Панель задач|Taskbar)$/ }))
    await userEvent.click(await canvas.findByRole('switch', { name: /^(Мини-плеер|Taskbar mini-player)$/ }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/Не удалось показать мини-плеер|Could not show the mini-player/)
  },
}
export const GlassUpdateCheckError: Story = {
  name: 'Стекло · проверка обновлений недоступна',
  globals: { interfaceTheme: 'glass', locale: 'ru' },
  parameters: { nativePreview: { updateCheckError: 'Сервер обновлений недоступен. Повторите позже.' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'О программе' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Сервер обновлений недоступен.')
    await expect(canvas.getByRole('button', { name: 'Проверить обновления' })).toBeEnabled()
  },
}
export const English: Story = { name: 'English', globals: { locale: 'en' } }
export const MusicSource: Story = {
  name: 'Источник музыки',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sourcePage = canvas.getByRole('button', { name: /^(Источник музыки|Music source)$/ })
    await userEvent.click(sourcePage)
    await expect(sourcePage).toHaveAttribute('aria-current', 'page')
    // Functional source checks must not depend on animation frames in a hidden
    // renderer. NavigationTransitions covers appearance and focus separately.
    await waitFor(() => expect(canvas.getByRole('button', { name: /^(Подключить|Connect)$/ })).toBeEnabled())
    await expect(canvas.getByRole('combobox')).toBeEnabled()
    await expect(canvas.getByRole('combobox')).toHaveValue('')
  },
}
export const SourceNarrow: Story = {
  name: 'Источники · узкое окно', parameters: { workshop: { width: 420 } },
  play: MusicSource.play,
}
export const SourceEnglish: Story = {
  name: 'Источники · English', globals: { locale: 'en' }, play: MusicSource.play,
}
export const SpotifyConnected: Story = {
  name: 'Источники · Spotify подключён',
  parameters: { preferredSourceAppId: 'spotify' },
  args: {
    mediaSessions: [
      { sourceAppId: 'Spotify.exe', playbackStatus: 'playing', isCurrent: true },
      { sourceAppId: 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify', playbackStatus: 'paused', isCurrent: false },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^(Источник музыки|Music source)$/ }))
    const spotify = canvas.getByText('Spotify', { selector: 'strong' }).closest('article')!
    const windows = canvas.getByText('Windows', { selector: 'strong' }).closest('article')!
    await waitFor(() => {
      expect(spotify).toHaveClass('protocol-row--selected')
      expect(within(spotify).getByText(/^(Подключено|Connected)$/)).toBeVisible()
      expect(windows).not.toHaveClass('protocol-row--selected')
      expect(windows.querySelector('.status-chip--success')).toBeNull()
      expect(canvas.queryByRole('combobox')).toBeNull()
    })
  },
}
export const SpotifyWaiting: Story = {
  name: 'Источники · Spotify ожидает трек',
  parameters: { preferredSourceAppId: 'spotify' },
  args: {
    mediaSessions: [{ sourceAppId: 'YandexMusic.exe', playbackStatus: 'paused', isCurrent: false }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^(Источник музыки|Music source)$/ }))
    const spotify = canvas.getByText('Spotify', { selector: 'strong' }).closest('article')!
    const windows = canvas.getByText('Windows', { selector: 'strong' }).closest('article')!
    await waitFor(() => {
      expect(spotify).toHaveClass('protocol-row--selected')
      expect(within(spotify).getByText(/^(Ожидание|Waiting)$/)).toBeVisible()
      expect(within(spotify).getByRole('button', { name: /^(Открыть Spotify|Open Spotify)$/ })).toBeEnabled()
      expect(windows).not.toHaveClass('protocol-row--selected')
      expect(windows.querySelector('.status-chip--success')).toBeNull()
    })
  },
}
export const SpotifyUnavailable: Story = {
  name: 'Источники · Spotify недоступен',
  parameters: { preferredSourceAppId: 'spotify' },
  args: {
    smtcHealth: { ...health, status: 'unavailable' },
    mediaSessions: [{ sourceAppId: 'Spotify.exe', playbackStatus: 'playing', isCurrent: true }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^(Источник музыки|Music source)$/ }))
    const spotify = canvas.getByText('Spotify', { selector: 'strong' }).closest('article')!
    const windows = canvas.getByText('Windows', { selector: 'strong' }).closest('article')!
    await waitFor(() => {
      expect(spotify).toHaveClass('protocol-row--selected', 'protocol-row--unavailable')
      expect(within(spotify).getByText(/^(Нет связи|Unavailable)$/)).toBeVisible()
      expect(within(spotify).getByText(/^(Системное управление музыкой Windows недоступно\.|Windows media controls are unavailable\.)$/)).toBeVisible()
      expect(within(spotify).queryByText(/^(Подключено|Connected)$/)).toBeNull()
      expect(spotify.querySelector('.status-chip--success')).toBeNull()
      expect(spotify.querySelector('.status-chip--warning')).not.toBeNull()
      expect(windows).not.toHaveClass('protocol-row--selected')
      expect(windows.querySelector('.status-chip--success')).toBeNull()
    })
  },
}
export const DirectConnected: Story = {
  name: 'Источники · Яндекс Музыка подключена',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^(Источник музыки|Music source)$/ }))
    await userEvent.click(canvas.getByRole('button', { name: /^(Подключить|Connect)$/ }))
    const dialog = within(document.body).getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /^(Подключить|Connect)$/ }))
    await waitFor(() => expect(canvas.getByRole('button', { name: /^(Отключить|Disconnect)$/ })).toBeEnabled())
  },
}
export const DirectConnectedNarrow: Story = {
  name: 'Источники · подключено в узком окне', parameters: { workshop: { width: 420 } }, play: DirectConnected.play,
}
export const TaskbarNarrow: Story = {
  name: 'Панель задач · узкое окно', parameters: { workshop: { width: 420 } }, play: Taskbar.play,
}
export const TaskbarNoSpace: Story = {
  name: 'Панель задач · недостаточно места',
  parameters: { nativePreview: { taskbar: { state: 'no-space' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^(Панель задач|Taskbar)$/ }))
    await userEvent.click(canvas.getByRole('switch', { name: /^(Мини-плеер|Taskbar mini-player)$/ }))
    await expect(await canvas.findByText(/не хватает места|not enough room/)).toBeVisible()
  },
}
export const SourceAttention: Story = {
  name: 'Источники · требуется внимание',
  args: { smtcHealth: { ...health, status: 'degraded' } },
  play: MusicSource.play,
}
export const System: Story = {
  name: 'Система и автозапуск',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^(Система|System)$/ }))
    await waitFor(() => expect(canvas.getAllByRole('switch')[0]).toBeVisible())
  },
}
export const About: Story = {
  name: 'О программе и обновления',
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^(О программе|About)$/ }))
  },
}
export const LanguageSwitch: Story = {
  name: 'Смена языка после перехода',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const russian = canvas.getByRole('button', { name: /^Ru$/ })
    if (russian.getAttribute('aria-pressed') !== 'true') {
      await userEvent.click(russian)
      await waitFor(() => expect(args.onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ appearance: expect.objectContaining({ locale: 'ru' }) }),
      ))
    }
    await userEvent.click(canvas.getByRole('button', { name: /^(Система|System)$/ }))
    await userEvent.click(canvas.getByRole('button', { name: /^(О программе|About)$/ }))
    await userEvent.click(canvas.getByRole('button', { name: /^En$/ }))
    // The save is debounced in the production panel. Check after the callback,
    // when a React-owned state update previously reran the Storybook hooks.
    await waitFor(() => expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ appearance: expect.objectContaining({ locale: 'en' }) }),
    ))
    await expect(canvas.getByRole('region', { name: /^Settings$/ })).toBeVisible()
    await expect(canvas.queryByRole('heading', { name: /^Settings$/ })).not.toBeInTheDocument()
  },
}
export const Narrow: Story = {
  name: 'Узкое окно · 620 px',
  parameters: { workshop: { width: 620 } },
}
export const Consent: Story = {
  name: 'Согласие на прямое подключение',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^(Источник музыки|Music source)$/ }))
    const connect = canvas.getByRole('button', { name: /^(Подключить|Connect)$/ })
    await userEvent.click(connect)
    const body = within(document.body)
    const dialog = body.getByRole('dialog', { name: /Подключить Яндекс Музыку|Connect Yandex Music/ })
    await waitFor(() => expect(dialog).toBeVisible())
    const cancel = within(dialog).getByRole('button', { name: /^(Отмена|Cancel)$/ })
    await waitFor(() => expect(cancel).toHaveFocus())
    await userEvent.tab({ shift: true })
    await expect(within(dialog).getByRole('button', { name: /^(Подключить|Connect)$/ })).toHaveFocus()
    await userEvent.tab()
    await expect(cancel).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect(body.queryByRole('dialog')).not.toBeInTheDocument()
    await expect(connect).toHaveFocus()
    // Leave the production modal open for visual review after checking its lifecycle.
    await userEvent.click(connect)
    await waitFor(() => expect(body.getByRole('dialog')).toBeVisible())
  },
}

export const NavigationTransitions: Story = {
  name: 'Меню · переходы и клавиатура',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const name of [/^(Источник музыки|Music source)$/, /^(Система|System)$/, /^(Внешний вид|Appearance)$/, /^(О программе|About)$/]) {
      await userEvent.click(canvas.getByRole('button', { name }))
    }
    await waitFor(() => expect(canvas.getByRole('heading', { name: /^(О программе|About)$/ })).toBeVisible())
    await expect(canvasElement.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    // Moving the selection never replaces or disables the focused control.
    await userEvent.tab({ shift: true })
    await expect(canvas.getByRole('button', { name: /^(Система|System)$/ })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(canvas.getByRole('heading', { name: /^(Система|System)$/ })).toBeVisible())
  },
}

export const ReducedMotion: Story = {
  name: 'Меню · без движения',
  parameters: { reducedMotion: true, workshop: { note: 'Уменьшение движения выключает перемещения подложки, появление разделов и отклик масштабированием. Управление и фокус сохраняются.' } },
  play: async (context) => {
    await NavigationTransitions.play?.(context)
    const panel = context.canvasElement.querySelector('.settings-panel')!
    await expect(panel).toHaveAttribute('data-reduced-motion', 'true')
    const section = panel.querySelector('.settings-section:not([hidden])')!
    await expect(getComputedStyle(section).animationName).toBe('none')
  },
}

export const VoiceDeveloperMode: Story = {
  name: 'Better Voice · режим разработчика',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const previewLabel = /^(Превью анимации лиса|Fox animation preview)$/
    await userEvent.click(canvas.getByRole('button', { name: /^Better Voice/ }))
    await expect(canvasElement.querySelector('.voice-atmosphere')).toBeInTheDocument()
    await expect(canvas.queryByRole('combobox', { name: previewLabel })).not.toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: /^Music Island$/ }))
    await userEvent.click(canvas.getByRole('button', { name: /^(О программе|About)$/ }))
    await userEvent.click(canvas.getByRole('switch', { name: /^(Режим разработчика|Developer mode)$/ }))
    await userEvent.click(canvas.getByRole('button', { name: /^Better Voice/ }))
    await expect(canvas.getByRole('combobox', { name: previewLabel })).toHaveValue('')
    // Developer mode still owns the fox preview; the background has no selector.
    await expect(canvasElement.querySelectorAll('.fox-dev-preview select')).toHaveLength(1)
    await waitFor(() => expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        plugins: expect.objectContaining({
          settings: expect.objectContaining({ ui: expect.objectContaining({ developerMode: true }) }),
        }),
      }),
    ))

    await userEvent.click(canvas.getByRole('button', { name: /^Music Island$/ }))
    await userEvent.click(canvas.getByRole('button', { name: /^(О программе|About)$/ }))
    await userEvent.click(canvas.getByRole('switch', { name: /^(Режим разработчика|Developer mode)$/ }))
    await userEvent.click(canvas.getByRole('button', { name: /^Better Voice/ }))
    await waitFor(() => expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        plugins: expect.objectContaining({
          settings: expect.objectContaining({ ui: expect.objectContaining({ developerMode: false }) }),
        }),
      }),
    ))
    await expect(canvas.queryByRole('combobox', { name: previewLabel })).not.toBeInTheDocument()
    await expect(canvasElement.querySelector('.voice-atmosphere')).toBeInTheDocument()
  },
}

export const VoiceDeveloperEnglish: Story = {
  name: 'Better Voice · светлое окно и тёмная сцена',
  globals: { locale: 'en', interfaceTheme: 'glass' },
  play: VoiceDeveloperMode.play,
}

export const DictationInput: Story = { name: 'Диктовка · сочетание и точка в конце', play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  await userEvent.click(within(canvas.getByRole('group', { name: 'Раздел настроек' })).getByRole('button', { name: 'Диктовка' }))
  const shortcut = await canvas.findByRole('button', { name: 'Ctrl+Space' })
  await userEvent.click(shortcut)
  await userEvent.keyboard('[ControlLeft>][KeyK][/ControlLeft]')
  await waitFor(() => expect(canvas.getByRole('button', { name: 'ctrl_left+k' })).toBeVisible())
  await userEvent.click(canvas.getByRole('button', { name: 'Дополнительно' }))
  const period = await canvas.findByRole('switch', { name: 'Убирать точку в конце' })
  await userEvent.click(period)
  await expect(period).toHaveAttribute('aria-checked', 'true')
  await userEvent.click(canvas.getByRole('button', { name: 'Основное' }))
  await waitFor(() => expect(canvas.getByRole('button', { name: 'ctrl_left+k' })).toBeVisible())
  await userEvent.click(canvas.getByRole('button', { name: 'Дополнительно' }))
  await expect(await canvas.findByRole('switch', { name: 'Убирать точку в конце' })).toHaveAttribute('aria-checked', 'true')
  await userEvent.click(canvas.getByRole('button', { name: 'Основное' }))
  const transcribe = within(await canvas.findByRole('group', { name: 'Сочетание клавиш' }))
  await userEvent.click(transcribe.getByRole('button', { name: 'Сбросить сочетание' }))
  await expect(await canvas.findByRole('button', { name: 'Ctrl+Space' })).toBeVisible()
} }

export const RetryFailedSave: Story = {
  name: 'Ошибка сохранения · повтор с сохранённым выбором',
  globals: { interfaceTheme: 'glass', locale: 'ru' },
  args: { onChange: fn(async () => {}) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const classic = canvas.getByRole('radio', { name: 'Классическая' })
    const save = args.onChange as ReturnType<typeof fn>
    save.mockRejectedValueOnce(new Error('Disk full'))
    await userEvent.click(classic)
    const retry = await canvas.findByRole('button', { name: 'Сохранить снова' })
    await expect(classic).toBeChecked()
    await expect(canvasElement.querySelector('.island-preview .island-root')).toHaveAttribute('data-interface-theme', 'classic')
    await userEvent.click(retry)
    await waitFor(() => expect(canvas.queryByRole('button', { name: 'Сохранить снова' })).toBeNull())
    await expect(save).toHaveBeenCalledTimes(2)
  },
}
