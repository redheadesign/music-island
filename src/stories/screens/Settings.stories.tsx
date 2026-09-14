import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState, type ComponentProps } from 'react'
import { useGlobals } from 'storybook/preview-api'
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test'
import { SettingsPanel } from '../../features/settings/SettingsPanel'
import { getDefaultConfig } from '../../app/tauriApi'
import type { AppConfig, Locale } from '../../shared/lib/types'
import { getSettingsColorScheme, withUiPrefs, type SettingsColorScheme } from '../../shared/lib/uiPrefs'
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
  colorScheme,
  preferredSourceAppId,
  scrollViewportHeight,
}: {
  args: ComponentProps<typeof SettingsPanel>
  locale: Locale
  accent: string
  onPreviewChange: (config: AppConfig) => void
  reducedMotion?: boolean
  colorScheme?: SettingsColorScheme
  preferredSourceAppId?: string
  scrollViewportHeight?: number
}) {
  const [config, setConfig] = useWorkshopConfig(locale, accent)
  const usage = useUsageController()
  const [selectedColorScheme, setSelectedColorScheme] = useState(colorScheme)
  const previewConfig = useMemo(() => selectedColorScheme
    ? withUiPrefs(config, { settingsColorScheme: selectedColorScheme }) : config,
  [config, selectedColorScheme])
  const configuredPreview = preferredSourceAppId
    ? { ...previewConfig, media: { ...previewConfig.media, protocol: 'smtc' as const, preferredSourceAppId } }
    : previewConfig
  const panel = <SettingsPanel
        {...args}
        usage={usage}
        config={reducedMotion ? { ...configuredPreview, appearance: { ...configuredPreview.appearance, reducedMotion: true } } : configuredPreview}
        onChange={(next) => {
          setSelectedColorScheme(getSettingsColorScheme(next))
          setConfig(next)
          onPreviewChange(next)
          args.onChange(next)
        }}
      />
  return <div className="settings-window-root">
    {scrollViewportHeight ? <div className="settings-scroll" style={{ height: scrollViewportHeight }}>{panel}</div> : panel}
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
        colorScheme={context.parameters.settingsColorScheme as SettingsColorScheme | undefined}
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
export const Default: Story = { name: 'Настройки приложения' }
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
  parameters: { settingsColorScheme: 'dark' },
}
export const AppearanceLight: Story = {
  name: 'Внешний вид · светлое оформление',
  parameters: { settingsColorScheme: 'light' },
}
export const HeaderDark: Story = {
  name: 'Шапка · тёмное оформление',
  parameters: { settingsColorScheme: 'dark', workshop: { width: 860, height: 360 } },
}
export const HeaderLight: Story = {
  name: 'Шапка · светлое оформление',
  parameters: { settingsColorScheme: 'light', workshop: { width: 860, height: 360 } },
}
export const AppearanceNarrow: Story = {
  name: 'Внешний вид · узкое окно',
  parameters: { settingsColorScheme: 'light', workshop: { width: 420 } },
}
export const AppearanceInteraction: Story = {
  name: 'Внешний вид · живой предпросмотр',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const preview = canvasElement.querySelector<HTMLElement>('.island-preview')!
    const scene = preview.querySelector<HTMLElement>('.island-preview__frame')!
    const island = preview.querySelector<HTMLElement>('.island-card')!
    const width = canvas.getAllByRole('slider', { name: /^(Ширина островка|Island width)$/ })[0]

    await expect(preview).toBeInTheDocument()
    await expect(island).toBeInTheDocument()
    await expect(canvas.getByRole('heading', { level: 2, name: /^(Внешний вид|Appearance)$/ })).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: /^(Включить светлую тему|Switch to light theme)$/ }))
    await waitFor(() => expect(canvasElement.querySelector('.settings-window-root')).toHaveAttribute('data-color-scheme', 'light'))
    await waitFor(() => expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        plugins: expect.objectContaining({
          settings: expect.objectContaining({ ui: expect.objectContaining({ settingsColorScheme: 'light' }) }),
        }),
      }),
    ))

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
    const scroller = canvasElement.querySelector<HTMLElement>('.settings-scroll')!
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
    await expect(canvas.getByRole('heading', { level: 2, name: /^(Панель задач|Taskbar)$/ })).toBeVisible()
    const toggle = () => canvas.getByRole('switch', { name: /^(Мини-плеер в панели задач|Taskbar mini-player)$/ })
    await expect(toggle()).not.toBeChecked()
    await userEvent.click(toggle())
    await waitFor(() => expect(args.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ taskbar: expect.objectContaining({ enabled: true }), media: args.config.media }),
    ))
    await waitFor(() => expect(toggle()).toBeChecked())
    if (parameters.reducedMotion === true) {
      await waitFor(() => {
        expect(canvasElement.querySelector('.taskbar-preview__material')).toHaveAttribute('data-speed', '0')
        expect(canvasElement.querySelector('.taskbar-preview__material')).toHaveAttribute('data-motion', 'paused')
      })
    }
    const size = canvas.getByRole('slider', { name: /^(Размер кнопок|Button size)/ })
    fireEvent.change(size, { target: { value: '125' } })
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
export const TaskbarLight: Story = {
  ...Taskbar,
  name: 'Панель задач · светлое оформление',
  parameters: { settingsColorScheme: 'light' },
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
    await userEvent.click(within(canvasElement).getByRole('button', { name: /^(Система|System)$/ }))
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
      expect(within(spotify).getByText(/^(Требует внимания|Needs attention)$/)).toBeVisible()
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
    await userEvent.click(canvas.getByRole('switch', { name: /^(Мини-плеер в панели задач|Taskbar mini-player)$/ }))
    await expect(await canvas.findByRole('status')).toHaveTextContent(/не хватает места|not enough room/)
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
    await waitFor(() => expect(canvas.getByRole('switch')).toBeVisible())
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

    await userEvent.click(canvas.getByRole('button', { name: /^(Режим разработчика|Developer mode)$/ }))
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

    await userEvent.click(canvas.getByRole('button', { name: /^(Выключить режим разработчика|Turn off developer mode)$/ }))
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
  name: 'Better Voice · developer mode',
  globals: { locale: 'en' },
  play: VoiceDeveloperMode.play,
}
