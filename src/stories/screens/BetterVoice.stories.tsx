import type { Meta, StoryObj } from '@storybook/react-vite'
import { useArgs } from 'storybook/preview-api'
import { expect, fn, userEvent, waitFor } from 'storybook/test'
import { VoiceSettingsView } from '../../features/plugins/voice/VoiceSettingsView'
import { voicePluginApi } from '../mocks/voiceApi'
import { loadSession, resetVoiceSession } from '../mocks/voiceSession'

const meta = {
  title: 'Screens/BetterVoice',
  component: VoiceSettingsView,
  args: {
    locale: 'ru',
    active: true,
    developerMode: false,
    showExperimentalBanner: true,
    onDismissExperimentalBanner: fn().mockName('voice.dismissBeta'),
  },
  argTypes: { locale: { table: { disable: true } } },
  parameters: {
    settingsColorScheme: 'dark',
    workshop: {
      width: 760,
      note: 'Демонстрация без доступа к микрофону. Запуск, модели и эффекты работают с отдельным адаптером Storybook.',
    },
  },
  render: function Voice(args, context) {
    const [, updateArgs] = useArgs()
    const colorScheme = context.parameters.settingsColorScheme === 'light' ? 'light' : 'dark'
    return (
      <div className="settings-window-root" data-color-scheme={colorScheme}>
        <VoiceSettingsView
          {...args}
          locale={context.globals.locale}
          onDismissExperimentalBanner={() => {
            updateArgs({ showExperimentalBanner: false })
            args.onDismissExperimentalBanner?.()
          }}
        />
      </div>
    )
  },
} satisfies Meta<typeof VoiceSettingsView>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {
  name: 'Готов к запуску',
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() => expect(canvas.getByRole('button', { name: /Включить обработку|Start processing/ })).toBeEnabled())
    await expect(canvas.getByRole('group', { name: /Обработка|Processing/ })).toHaveAttribute('data-signal-active', 'false')
    await expect(canvas.queryByRole('heading', { name: /^(Устройства|Devices)$/ })).not.toBeInTheDocument()
    const capsule = canvasElement.querySelector<HTMLElement>('.voice-signal-node--processing')!
    const capsuleBounds = capsule.getBoundingClientRect()
    await expect(Math.round(capsuleBounds.width)).toBe(154)
    await expect(capsuleBounds.height).toBeGreaterThanOrEqual(96)
    await expect(capsuleBounds.height).toBeLessThanOrEqual(120)
    for (const meter of canvas.getAllByRole('meter')) {
      await expect(meter).toHaveAttribute('aria-valuenow', '0')
    }
  },
}
export const Running: Story = {
  name: 'Микрофон включён',
  parameters: {
    voicePreview: { running: true },
    workshop: { note: 'Живой маршрут показывает реальный вход, локальную обработку и выбранный виртуальный выход. Импульс движется только при активной обработке.' },
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole('button', { name: /Остановить|Stop processing/ })).toBeEnabled())
    const flow = canvas.getByRole('group', { name: /Обработка|Processing/ })
    await expect(flow).toHaveAttribute('data-signal-active', 'true')
    await expect(canvas.getByRole('button', { name: /^(Микрофон|Microphone)$/ })).toHaveTextContent('Studio USB')
    await expect(canvas.getByRole('button', { name: /^(Виртуальный выход|Virtual output)$/ })).toHaveTextContent('CABLE Input')
    const meters = canvas.getAllByRole('meter')
    await expect(meters).toHaveLength(2)
    await expect(Number(meters[0].getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    await expect(Number(meters[1].getAttribute('aria-valuenow'))).toBeGreaterThan(0)
  },
}
export const ReducedMotion: Story = {
  name: 'Обработка · без движения',
  args: { reducedMotion: true },
  parameters: {
    voicePreview: { running: true },
    workshop: { note: 'Данные входа и выхода остаются живыми, но маршрут и спектр не запускают непрерывную анимацию.' },
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole('button', { name: /Остановить|Stop processing/ })).toBeEnabled())
    await expect(canvas.getByRole('group', { name: /Обработка|Processing/ })).toHaveAttribute('data-signal-active', 'false')
    for (const meter of canvas.getAllByRole('meter')) {
      await expect(Number(meter.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    }
  },
}
export const NoCable: Story = {
  name: 'Кабель не установлен',
  parameters: { voicePreview: { cableInstalled: false } },
}
export const StartError: Story = {
  name: 'Ошибка при запуске',
  args: { showExperimentalBanner: false },
  parameters: {
    voicePreview: { failStart: true },
    workshop: {
      note: 'Ошибка открытия микрофона после попытки запуска. Можно выбрать другое устройство и повторить запуск.',
    },
  },
  play: async ({ canvas }) => {
    const start = await canvas.findByRole('button', { name: /Включить обработку|Start processing/ })
    await waitFor(() => expect(start).toBeEnabled())
    await userEvent.click(start)
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Не удалось открыть микрофон')
    await expect(start).toBeEnabled()
    await expect(voicePluginApi.startDenoising).toHaveBeenCalledTimes(1)
    await expect(canvas.getByRole('button', { name: /Робот|Robot/ })).toBeDisabled()
  },
}
export const Developer: Story = {
  name: 'Просмотр клипов',
  args: { developerMode: true },
}
export const Focused: Story = {
  name: 'Без подсказки о бета-версии',
  args: { showExperimentalBanner: false },
  parameters: { voicePreview: { running: true } },
  play: Running.play,
}
export const Equalizer: Story = {
  name: 'Эквалайзер включён',
  parameters: { voicePreview: { running: true } },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole('button', { name: /Остановить|Stop processing/ })).toBeEnabled())
    await userEvent.click(canvas.getByRole('switch', { name: /Эквалайзер|Equalizer/ }))
    await userEvent.click(canvas.getByRole('button', { name: /Глубокий|Deep/ }))
  },
}
export const VoiceEffect: Story = {
  name: 'Голосовой эффект включён',
  parameters: { voicePreview: { running: true } },
  play: async ({ canvas }) => {
    const effect = canvas.getByRole('button', { name: /Робот|Robot/ })
    await waitFor(() => expect(effect).toBeEnabled())
    await userEvent.click(effect)
    await expect(effect).toHaveAttribute('aria-pressed', 'true')
    await expect(voicePluginApi.setExplodeMode).toHaveBeenLastCalledWith(true, 100)
  },
}
export const EffectToggles: Story = {
  name: 'Эффекты: переключение и старые настройки',
  parameters: {
    voicePreview: { running: false },
    workshop: { note: 'Проверка реальных действий компонента: запуск, включение и выключение эффекта, смена эффекта и остановка. Старая интенсивность 50% заменяется на 100%.' },
  },
  beforeEach: () => {
    resetVoiceSession({
      version: 2,
      enabled: true,
      strength: 55,
      model: 'rnnoise',
      inputDevice: 'Микрофон · Studio USB',
      outputDevice: 'CABLE Input (VB-Audio Virtual Cable)',
      monitorEnabled: false,
      monitorPoint: 5,
      eqEnabled: false,
      eqBands: Array(10).fill(0),
      agcEnabled: false,
      agcTarget: 0.032,
      micGain: 1,
      presetId: null,
      fxIntensity: 50,
      engineRunning: false,
    })
  },
  play: async ({ canvas }) => {
    const start = await canvas.findByRole('button', { name: /Включить обработку|Start processing/ })
    await waitFor(() => expect(start).toBeEnabled())
    await userEvent.click(start)
    await waitFor(() => expect(canvas.getByRole('button', { name: /Остановить|Stop processing/ })).toBeEnabled())
    const robot = canvas.getByRole('button', { name: /Робот|Robot/ })
    const echo = canvas.getByRole('button', { name: /Эхо|Echo/ })
    await userEvent.click(robot)
    await expect(robot).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(robot)
    await expect(robot).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(echo)
    await expect(echo).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(robot)
    await expect(robot).toHaveAttribute('aria-pressed', 'true')
    await expect(echo).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(canvas.getByRole('button', { name: /Остановить|Stop processing/ }))
    await waitFor(() => expect(start).toBeEnabled())
    await expect(robot).toBeDisabled()
    await userEvent.click(start)
    await waitFor(() => expect(robot).toBeEnabled())
    await expect(robot).toHaveAttribute('aria-pressed', 'false')
    await expect(voicePluginApi.setExplodeMode.mock.calls).toEqual([
      [false, 100], [true, 100], [false, 100], [true, 100],
      [true, 100], [false, 100], [false, 100],
    ])
    await expect(voicePluginApi.setExplodeEffect.mock.calls).toEqual([[4], [6], [4]])
    await waitFor(() => expect(loadSession()?.fxIntensity).toBe(100))
    await expect(loadSession()?.inputDevice).toBe('Микрофон · Studio USB')
  },
}
export const GainReset: Story = {
  name: 'Усиление: сброс до 100%',
  args: { showExperimentalBanner: false },
  parameters: {
    voicePreview: { running: true },
    workshop: { note: 'Сброс ручного усиления с 260% до 100% меняет работающий обработчик и сохранённую настройку. Автоматическое усиление остаётся выключенным.' },
  },
  beforeEach: () => {
    resetVoiceSession({
      version: 2,
      enabled: true,
      strength: 55,
      model: 'rnnoise',
      inputDevice: 'Микрофон · Studio USB',
      outputDevice: 'CABLE Input (VB-Audio Virtual Cable)',
      monitorEnabled: false,
      monitorPoint: 5,
      eqEnabled: false,
      eqBands: Array(10).fill(0),
      agcEnabled: false,
      agcTarget: 0.032,
      micGain: 2.6,
      presetId: null,
      fxIntensity: 100,
      engineRunning: false,
    })
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByRole('button', { name: /Остановить|Stop processing/ })).toBeEnabled())
    const gain = canvas.getByRole('slider', { name: /^(Усиление|Mic gain)/ })
    const reset = canvas.getByRole('button', { name: /^(Сбросить усиление до 100%|Reset gain to 100%)$/ })
    const manual = canvas.getByRole('button', { name: /^(Вручную|Manual)$/ })
    const automatic = canvas.getByRole('button', { name: /^(Авто|Auto)$/ })
    await expect(gain).toHaveValue('260')
    await expect(reset).toBeEnabled()
    await expect(manual).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(reset)
    await expect(gain).toHaveValue('100')
    await expect(reset).toBeDisabled()
    await expect(voicePluginApi.updateDenoiseConfig).toHaveBeenCalledTimes(1)
    await expect(voicePluginApi.updateDenoiseConfig).toHaveBeenCalledWith(expect.objectContaining({ micGain: 1 }))
    await expect(manual).toHaveAttribute('aria-pressed', 'true')
    await expect(automatic).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(loadSession()).toEqual(expect.objectContaining({
      micGain: 1,
      agcEnabled: false,
      agcTarget: 0.032,
      inputDevice: 'Микрофон · Studio USB',
    })))
  },
}
export const Narrow: Story = {
  name: 'Узкое окно',
  parameters: {
    workshop: { width: 420, note: 'Маршрут складывается сверху вниз: микрофон, обработка, виртуальный выход.' },
    voicePreview: { running: true },
  },
  play: Running.play,
}
export const Light: Story = {
  name: 'Светлое оформление',
  parameters: {
    settingsColorScheme: 'light',
    voicePreview: { running: true },
    workshop: {
      width: 760,
      note: 'Светлая оболочка настроек с рабочим трактом и живыми уровнями.',
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() => expect(canvas.getByRole('button', { name: /Остановить|Stop processing/ })).toBeEnabled())
    const root = canvasElement.querySelector<HTMLElement>('.settings-window-root')!
    const hero = canvasElement.querySelector<HTMLElement>('.voice-control-card')!
    const flow = canvas.getByRole('group', { name: /Обработка|Processing/ })
    await expect(root).toHaveAttribute('data-color-scheme', 'light')
    await expect(getComputedStyle(hero).backgroundColor).toBe('rgb(24, 25, 28)')
    await expect(getComputedStyle(hero).color).toBe('rgb(245, 245, 247)')
    await expect(flow.scrollWidth).toBeLessThanOrEqual(flow.clientWidth)

    await userEvent.click(canvas.getByRole('button', { name: /^(Микрофон|Microphone)$/ }))
    let menu: HTMLElement | null = null
    await waitFor(() => {
      menu = root.ownerDocument.querySelector<HTMLElement>('.dark-select-menu')
      expect(menu).toBeVisible()
    })
    await expect(getComputedStyle(menu!).backgroundColor).toBe('rgba(255, 255, 255, 0.78)')
    await userEvent.keyboard('{Escape}')
  },
}
export const LightNarrow: Story = {
  name: 'Светлое оформление · узко',
  parameters: {
    settingsColorScheme: 'light',
    voicePreview: { running: true },
    workshop: {
      width: 420,
      note: 'Светлая узкая компоновка сохраняет вертикальный тракт в границах панели.',
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() => expect(canvas.getByRole('button', { name: /Остановить|Stop processing/ })).toBeEnabled())
    const root = canvasElement.querySelector<HTMLElement>('.settings-window-root')!
    const flow = canvas.getByRole('group', { name: /Обработка|Processing/ })
    await expect(root).toHaveAttribute('data-color-scheme', 'light')
    await expect(flow.scrollWidth).toBeLessThanOrEqual(flow.clientWidth)
    for (const node of flow.querySelectorAll<HTMLElement>('.voice-signal-node')) {
      await expect(node.getBoundingClientRect().left).toBeGreaterThanOrEqual(root.getBoundingClientRect().left - 0.5)
      await expect(node.getBoundingClientRect().right).toBeLessThanOrEqual(root.getBoundingClientRect().right + 0.5)
    }
  },
}
export const Compact: Story = {
  name: 'Минимальная ширина · 320 px',
  args: { showExperimentalBanner: false },
  parameters: { workshop: { width: 320 }, voicePreview: { running: true } },
  play: async ({ canvas, canvasElement }) => {
    await waitFor(() => expect(canvas.getByRole('button', { name: /Остановить|Stop processing/ })).toBeEnabled())
    const settings = canvasElement.querySelector<HTMLElement>('.voice-settings')!
    await expect(settings.scrollWidth).toBeLessThanOrEqual(settings.clientWidth)
    for (const card of settings.querySelectorAll<HTMLElement>('.voice-control-card, .voice-settings-card')) {
      await expect(card.getBoundingClientRect().width).toBeLessThanOrEqual(settings.clientWidth)
      await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
    }
  },
}
export const English: Story = {
  name: 'Английский интерфейс',
  globals: { locale: 'en' },
}
