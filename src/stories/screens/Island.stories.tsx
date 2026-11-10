import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { OverlayShell } from '../../features/overlay/OverlayShell'
import type { IslandAppState, OverlayMode } from '../../app/useIslandApp'
import type { MediaSnapshot } from '../../shared/lib/types'
import type { LocalServer } from '../../shared/lib/localServerTypes'
import { getUiPrefs } from '../../shared/lib/uiPrefs'
import { media, health } from '../fixtures'
import { useWorkshopConfig } from '../useWorkshopConfig'
import { useUsageController } from '../../app/usage/useUsageController'

function IslandPreview({
  locale,
  accent,
  empty = false,
  recovery = false,
  restarting = false,
  unavailable = false,
  width = 100,
  scale = 100,
  update = false,
  longTrack = false,
  assistantLimits = false,
  localServersMode,
  localServersWidgetScale = 100,
  latestMessageMode,
}: {
  locale: 'ru' | 'en'
  accent: string
  empty?: boolean
  recovery?: boolean
  restarting?: boolean
  unavailable?: boolean
  width?: number
  scale?: number
  update?: boolean
  longTrack?: boolean
  assistantLimits?: boolean
  localServersMode?: 'expanded' | 'collapsed' | 'empty' | 'stoppable'
  localServersWidgetScale?: number
  latestMessageMode?: 'expanded' | 'collapsed'
}) {
  const [config, setConfig] = useWorkshopConfig(locale, accent, localServersMode !== 'collapsed' && latestMessageMode !== 'collapsed')
  const [localServers, setLocalServers] = useState(() => {
    if (localServersMode === 'empty') return []
    if (localServersMode === 'stoppable') return demoLocalServers.map((server) => ({ ...server, canStop: true }))
    return demoLocalServers
  })
  const usage = useUsageController(assistantLimits)
  const connectUsage = usage.connect
  useEffect(() => { if (assistantLimits) void connectUsage('codex') }, [assistantLimits, connectUsage])
  const [mode, setMode] = useState<OverlayMode>('expanded')
  const [track, setTrack] = useState<MediaSnapshot>({
    ...media,
    hasSession: !empty,
  })
  const ui = getUiPrefs(config)
  const app: IslandAppState = {
    config: {
      ...config,
      layout: { ...config.layout, width, scale },
      media: { ...config.media, protocol: unavailable ? 'smtc' : 'yandex-direct' },
      plugins: {
        ...config.plugins,
        enabled: latestMessageMode ? ['dictation'] : config.plugins.enabled,
        settings: {
          ...config.plugins.settings,
          ui: { ...ui, localServersEnabled: ui.localServersEnabled ?? Boolean(localServersMode), localServersWidgetScale, showLatestDictationMessage: Boolean(latestMessageMode), forceIslandUpdateBanner: update && !ui.islandUpdateSnoozedUntil },
          usage: { codexEnabled: assistantLimits, claudeEnabled: false },
        },
      },
    },
    media: {
      ...track,
      ...(unavailable ? { provider: 'smtc', smtcHealth: 'unavailable' } as const : {}),
      ...(longTrack ? { title: 'Очень длинное название композиции — концертная версия с оркестром', artist: 'Первый исполнитель, второй исполнитель и симфонический оркестр' } : {}),
    },
    mode,
    setMode,
    progressMs: track.positionMs,
    progressPercent: ((track.positionMs ?? 0) / (track.durationMs || 1)) * 100,
    smtcHealth: health,
    mediaSessions: [],
    waveContext: null,
    autostartError: null,
    autostartStatus: null,
    updateConfig: async (next) => {
      setConfig(next)
    },
    sendCommand: async (command) => {
      onCommand(command)
      setTrack((value) => {
        if (command === 'play-pause')
          return {
            ...value,
            playbackStatus:
              value.playbackStatus === 'playing' ? 'paused' : 'playing',
          }
        if (command === 'like') return { ...value, isLiked: !value.isLiked }
        if (typeof command === 'object' && 'seek' in command)
          return { ...value, positionMs: command.seek.positionMs }
        return value
      })
    },
    refreshMediaSessions: noop,
    refreshWaveContext: noop,
    selectWavePreset: noop,
    clearWaveSelection: noop,
    resetPosition: noop,
    openSettingsWindow: openSettings,
    directNeedsRecovery: recovery,
    directReloadBusy: restarting,
    restartDirect: async () => ({
      state: 'connected',
      message: 'Preview',
      port: null,
      executablePath: null,
    }),
  }
  return <OverlayShell app={app} usage={usage} latestDictation={latestMessageMode ? { message: demoDictationMessage, copy: copyHistoryMessage } : undefined} localServers={localServersMode ? {
    servers: localServers,
    open: openLocalServer,
    stop: async (server) => {
      stopLocalServer(server)
      setLocalServers((current) => current.filter((row) => row.pid !== server.pid))
    },
    stopAll: async (servers) => {
      stopAllLocalServers(servers)
      const pids = new Set(servers.map((server) => server.pid))
      setLocalServers((current) => current.filter((row) => !pids.has(row.pid)))
    },
  } : undefined} />
}
const demoLocalServers: LocalServer[] = [
  { id: 'vite-5173', pid: 12684, processName: 'node.exe', host: '127.0.0.1', port: 5173, canStop: true },
  { id: 'vite-4173', pid: 12684, processName: 'node.exe', host: '127.0.0.1', port: 4173, canStop: true },
  { id: 'python-8000', pid: 4780, processName: 'python.exe', host: '[::1]', port: 8000, canStop: false },
]
const noop = async () => {}
const demoDictationMessage = {
  id: 42, timestamp: 1784465200,
  text: 'На встрече обсудим макеты, согласуем следующий шаг и разошлём короткие итоги команде.',
}
const copyHistoryMessage = fn(async (_id: number) => {}).mockName('dictation.copyHistoryMessage')
const onCommand = fn().mockName('island.command')
const openSettings = fn(async () => {}).mockName('island.openSettings')
const openLocalServer = fn(async (_server: LocalServer) => {}).mockName('localServers.open')
const stopLocalServer = fn<(server: LocalServer) => void>().mockName('localServers.stop')
const stopAllLocalServers = fn<(servers: readonly LocalServer[]) => void>().mockName('localServers.stopAll')
const meta = {
  title: 'Screens/Island',
  component: IslandPreview,
  args: { locale: 'ru', accent: '#f76100', empty: false },
  argTypes: {
    locale: { table: { disable: true } },
    accent: { table: { disable: true } },
  },
  parameters: {
    workshop: {
      width: 850,
      height: 500,
      note: 'Настоящая оболочка островка, закреплённая для просмотра. Нативные зоны наведения и DPI проверяются отдельно в Windows.',
    },
  },
  globals: { surface: 'desktop' },
  render: (args, context) => (
    <IslandPreview
      {...args}
      key={`${context.id}-${args.empty}`}
      locale={context.globals.locale}
      accent={context.globals.accent}
    />
  ),
} satisfies Meta<typeof IslandPreview>
export default meta
export const Pinned: StoryObj<typeof meta> = { name: 'Закреплённый островок' }
export const AssistantLimits: StoryObj<typeof meta> = { name: 'Лимиты Codex рядом с островком', args: { assistantLimits: true } }
export const LocalServersExpanded: StoryObj<typeof meta> = {
  name: 'Локальные серверы под раскрытым островком',
  args: { localServersMode: 'stoppable', width: 100, scale: 90, localServersWidgetScale: 110 },
  play: async ({ canvasElement }) => {
    const widget = await within(canvasElement).findByRole('region', { name: /^(Локальные серверы|Local servers)$/ })
    const island = canvasElement.querySelector('.island-card')!
    await expect(widget.getBoundingClientRect().width).toBeCloseTo(island.getBoundingClientRect().width, 0)
    await expect(widget.style.getPropertyValue('--local-servers-content-scale')).toBe(String(110 / 90))
    await expect(within(widget).queryByRole('heading')).not.toBeInTheDocument()
    await expect(within(widget).queryByRole('button', { name: /^(Убрать виджет|Remove widget)$/ })).not.toBeInTheDocument()
    const rows = within(widget).getAllByRole('listitem')
    await expect(getComputedStyle(rows[0]).borderTopWidth).toBe('0px')
    await expect(getComputedStyle(rows[1]).borderTopWidth).not.toBe('0px')
    const stop = within(rows[0]).getByRole('button', { name: /^(Остановить сервер|Stop server) ·/ })
    const glyph = stop.querySelector('svg')!
    const { width, height } = glyph.viewBox.baseVal
    await expect(glyph.querySelector('path')?.isPointInFill(new DOMPoint(width / 2, height / 2))).toBe(true)
  },
}
export const LocalServersCollapsed: StoryObj<typeof meta> = {
  name: 'Свёрнутый островок · серверы скрыты',
  args: { localServersMode: 'collapsed', width: 80 },
  parameters: { workshop: { width: 390, height: 360 } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.island-root--collapsed')).toBeInTheDocument())
    await expect(within(canvasElement).queryByRole('region', { name: /^(Локальные серверы|Local servers)$/ })).not.toBeInTheDocument()
  },
}
export const LocalServersActions: StoryObj<typeof meta> = {
  ...LocalServersExpanded,
  name: 'Действия с локальными серверами',
  args: { ...LocalServersExpanded.args, localServersMode: 'expanded' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const widget = within(await canvas.findByRole('region', { name: /^(Локальные серверы|Local servers)$/ }))
    await waitFor(() => expect(widget.getByText('[::1]:8000')).toBeVisible())
    await expect(widget.queryByRole('button', { name: /^(Остановить сервер|Stop server) · \[::1\]:8000$/ })).not.toBeInTheDocument()
    await expect(widget.getByRole('button', { name: /^(Остановить всё|Stop all)$/ })).toBeDisabled()
    await userEvent.click(widget.getByRole('button', { name: /^(Открыть в браузере|Open in browser) · 127\.0\.0\.1:5173$/ }))
    await expect(openLocalServer).toHaveBeenLastCalledWith(demoLocalServers[0])

    const stop = widget.getByRole('button', { name: /^(Остановить сервер|Stop server) · 127\.0\.0\.1:5173$/ })
    await userEvent.click(stop)
    const cancel = widget.getByRole('button', { name: /^(Отмена|Cancel)$/ })
    await expect(cancel).toHaveFocus()
    await userEvent.click(cancel)
    await expect(stop).toHaveFocus()
    await userEvent.click(stop)
    await userEvent.click(widget.getByRole('button', { name: /^(Остановить процесс|Stop process)$/ }))
    await expect(stopLocalServer).toHaveBeenLastCalledWith(demoLocalServers[0])
    await waitFor(() => expect(widget.queryByText('127.0.0.1:4173')).not.toBeInTheDocument())
    await expect(widget.getByText('[::1]:8000')).toBeVisible()
    await expect(widget.queryByRole('button', { name: /^(Остановить всё|Stop all)$/ })).not.toBeInTheDocument()
  },
}
export const LocalServersStopAll: StoryObj<typeof meta> = {
  ...LocalServersExpanded,
  name: 'Локальные серверы · остановить всё',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const region = await canvas.findByRole('region', { name: /^(Локальные серверы|Local servers)$/ })
    const widget = within(region)
    const stopAll = widget.getByRole('button', { name: /^(Остановить всё|Stop all)$/ })
    await userEvent.click(stopAll)
    const cancel = widget.getByRole('button', { name: /^(Отмена|Cancel)$/ })
    await expect(cancel).toHaveFocus()
    await userEvent.click(cancel)
    await expect(stopAll).toHaveFocus()
    await expect(stopAllLocalServers).not.toHaveBeenCalled()
    await userEvent.click(stopAll)
    await userEvent.click(widget.getByRole('button', { name: /^(Остановить процессы|Stop processes)$/ }))
    await expect(stopAllLocalServers).toHaveBeenCalledTimes(1)
    await expect(stopAllLocalServers.mock.calls[0][0].map((server) => server.id)).toEqual(demoLocalServers.map((server) => server.id))
    await waitFor(() => expect(region).not.toBeInTheDocument())
  },
}
export const LocalServersEmpty: StoryObj<typeof meta> = {
  name: 'Виджет включён, серверы не запущены',
  args: { localServersMode: 'empty' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('region', { name: /^(Локальные серверы|Local servers)$/ })).not.toBeInTheDocument()
  },
}

export const LatestDictationCollapsed: StoryObj<typeof meta> = {
  name: 'Последнее сообщение скрыто · свёрнутый островок',
  args: { latestMessageMode: 'collapsed' },
  parameters: { workshop: { width: 540, height: 300 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('region', { name: /Последняя запись|Latest transcript/ })).not.toBeInTheDocument()
  },
}

export const LatestDictationExpanded: StoryObj<typeof meta> = {
  name: 'Последнее сообщение · под локальными серверами',
  args: { latestMessageMode: 'expanded', localServersMode: 'stoppable' },
  parameters: { workshop: { height: 640 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const servers = await canvas.findByRole('region', { name: /Локальные серверы|Local servers/ })
    const latest = canvas.getByRole('region', { name: /Последняя запись|Latest transcript/ })
    const player = canvasElement.querySelector<HTMLElement>('.island-card')!
    const playerBounds = player.getBoundingClientRect()
    const latestBounds = latest.getBoundingClientRect()
    await expect(latestBounds.left).toBeCloseTo(playerBounds.left, 0)
    await expect(latestBounds.width).toBeCloseTo(playerBounds.width, 0)
    await expect(latestBounds.width).toBeCloseTo(servers.getBoundingClientRect().width, 0)
    await expect(latestBounds.top).toBeGreaterThan(servers.getBoundingClientRect().bottom)
    await expect(getComputedStyle(latest).paddingLeft).toBe(getComputedStyle(player).paddingLeft)
  },
}

export const LatestDictationNarrow: StoryObj<typeof meta> = {
  ...LatestDictationExpanded,
  name: 'Последнее сообщение · компактный островок',
  args: { ...LatestDictationExpanded.args, width: 80, scale: 80 },
  parameters: { workshop: { width: 400, height: 520 } },
}

export const LatestDictationActions: StoryObj<typeof meta> = {
  name: 'Последнее сообщение · копирование и скрытие',
  args: { latestMessageMode: 'expanded' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const latest = await canvas.findByRole('region', { name: /Последняя запись|Latest transcript/ })
    const copy = within(latest).getByRole('button', { name: /Скопировать текст|Copy text/ })
    copy.focus()
    await userEvent.keyboard('{Enter}')
    await expect(copyHistoryMessage).toHaveBeenCalledWith(demoDictationMessage.id)
    await expect(within(latest).getByRole('status')).toHaveTextContent(/Текст скопирован|Text copied/)
    await userEvent.click(within(latest).getByRole('button', { name: /Скрыть сообщение|Hide message/ }))
    await expect(canvas.queryByRole('region', { name: /Последняя запись|Latest transcript/ })).not.toBeInTheDocument()
  },
}
export const Empty: StoryObj<typeof meta> = {
  name: 'Яндекс Музыка недоступна',
  args: { empty: true },
  play: async ({ canvasElement }) => {
    const button = await within(canvasElement).findByRole('button', { name: /Перезапустить Яндекс Музыку|Restart Yandex Music/ })
    await expect(button).toBeEnabled()
    await expect(button).toHaveClass('ui-button--primary')
  },
}
export const Restarting: StoryObj<typeof meta> = {
  name: 'Перезапуск Яндекс Музыки',
  args: { empty: true, restarting: true },
}
export const Recovery: StoryObj<typeof meta> = {
  name: 'Связь прервалась · минимальная ширина',
  args: { recovery: true, width: 80 },
}
export const OfflineWithUpdate: StoryObj<typeof meta> = {
  name: 'Нет связи и доступно обновление',
  args: { empty: true, update: true, width: 80 },
}
export const SmtcUnavailable: StoryObj<typeof meta> = {
  name: 'Windows не передаёт музыку',
  args: { unavailable: true, width: 80 },
}
export const LongTrack: StoryObj<typeof meta> = {
  name: 'Длинное название · минимальная ширина',
  args: { longTrack: true, width: 80 },
}
