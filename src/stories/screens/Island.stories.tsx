import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState, type CSSProperties } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { OverlayShell } from '../../features/overlay/OverlayShell'
import { IslandTopIndicator } from '../../features/overlay/IslandTopIndicator'
import type { IslandAppState, OverlayMode } from '../../app/useIslandApp'
import type { MediaSnapshot } from '../../shared/lib/types'
import type { LocalServer } from '../../shared/lib/localServerTypes'
import { normalizeInterfaceTheme, type InterfaceThemeId } from '../../shared/lib/interfaceTheme'
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
  interfaceTheme,
  artwork = 'warm',
  reducedMotion = false,
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
  interfaceTheme?: InterfaceThemeId
  artwork?: 'warm' | 'cool' | 'missing'
  reducedMotion?: boolean
}) {
  const [config, setConfig] = useWorkshopConfig(locale, accent, localServersMode !== 'collapsed' && latestMessageMode !== 'collapsed', interfaceTheme)
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
    thumbnailDataUrl: artwork === 'cool' ? coolCover : artwork === 'missing' ? null : media.thumbnailDataUrl,
  })
  const ui = getUiPrefs(config)
  const app: IslandAppState = {
    config: {
      ...config,
      appearance: { ...config.appearance, reducedMotion },
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
const coolCover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#1885d4"/><circle cx="112" cy="90" r="58" fill="#19afbb"/></svg>')}`
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
    handlesInterfaceTheme: true,
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
      key={`${context.id}-${args.empty}-${args.artwork}`}
      locale={context.globals.locale}
      accent={context.globals.accent}
      interfaceTheme={normalizeInterfaceTheme(context.globals.interfaceTheme)}
    />
  ),
} satisfies Meta<typeof IslandPreview>
export default meta
export const Pinned: StoryObj<typeof meta> = { name: 'Закреплённый островок' }
export const Glass: StoryObj<typeof meta> = { name: 'Стеклянный островок', globals: { interfaceTheme: 'glass' } }
export const GlassCoolCover: StoryObj<typeof meta> = {
  ...Glass, name: 'Стекло · частицы и прогресс в цветах обложки', args: { artwork: 'cool' },
  play: async ({ canvasElement }) => {
    const island = canvasElement.querySelector('.island-root')!
    const particles = [...canvasElement.querySelectorAll('.island-particles > i')]
    const progress = canvasElement.querySelector('.progress-fill')!
    await waitFor(() => expect(island).toHaveAttribute('data-cover-art', 'true'))
    await expect(particles.length).toBeGreaterThan(2)
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && !matchMedia('(prefers-reduced-transparency: reduce)').matches) {
      await expect(new Set(particles.map(particle => getComputedStyle(particle).animationDelay)).size).toBe(particles.length)
      await expect(getComputedStyle(particles[0]).animationName).toBe('island-particle-fall')
    }
    await expect(getComputedStyle(progress).backgroundImage).toContain('linear-gradient')
  },
}
export const GlassWithoutCover: StoryObj<typeof meta> = { ...Glass, name: 'Стекло · нейтральный прогресс без обложки', args: { artwork: 'missing' } }
export const GlassEdge: StoryObj<typeof meta> = {
  ...Glass,
  name: 'Стекло · отблеск у верхнего края',
  parameters: { workshop: { width: 460, height: 184, note: 'Момент наведения перед раскрытием островка.' } },
  render: ({ reducedMotion }) => (
    <div className={`island-root${reducedMotion ? ' reduced-motion' : ''}`} data-interface-theme="glass" data-cover-art="true"
      style={{ '--artwork-primary': '24, 133, 212', '--artwork-secondary': '25, 175, 187' } as CSSProperties}>
      <div className="island-top-chrome">
        <div className="edge-trigger edge-trigger--peeking" aria-hidden="true"
          style={{ '--peek-progress': 0.88, '--peek-x': '144px' } as CSSProperties}>
          <IslandTopIndicator progressPercent={38} hidden />
        </div>
      </div>
    </div>
  ),
}
export const GlassReducedMotion: StoryObj<typeof meta> = {
  ...Glass, name: 'Стекло · частицы при уменьшенном движении', args: { reducedMotion: true },
  play: async ({ canvasElement }) => {
    await expect(getComputedStyle(canvasElement.querySelector('.island-particles')!).display).toBe('none')
  },
}
export const GlassPlayback: StoryObj<typeof meta> = {
  ...Glass,
  name: 'Стекло · воспроизведение и пауза на обложке',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = await canvas.findByRole('button', { name: 'Pause' })
    const artwork = canvasElement.querySelector('.artwork-shell')!
    const buttonRect = button.getBoundingClientRect()
    const artworkRect = artwork.getBoundingClientRect()
    await expect(getComputedStyle(button).position).toBe('absolute')
    const center = { x: buttonRect.left + buttonRect.width / 2, y: buttonRect.top + buttonRect.height / 2 }
    await expect(center.x).toBeCloseTo(artworkRect.left + artworkRect.width / 2, 0)
    await expect(center.y).toBeCloseTo(artworkRect.top + artworkRect.height / 2, 0)
    await expect(button.contains(canvasElement.ownerDocument.elementFromPoint(center.x, center.y))).toBe(true)
    await userEvent.click(button)
    await expect(canvas.getByRole('button', { name: 'Play' })).toBeVisible()
    await userEvent.keyboard(' ')
    await expect(canvas.getByRole('button', { name: 'Pause' })).toBeVisible()
  },
}
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
export const GlassEmpty: StoryObj<typeof meta> = { ...Empty, name: 'Стекло · Яндекс Музыка недоступна', globals: Glass.globals }
export const GlassRestarting: StoryObj<typeof meta> = { ...Restarting, name: 'Стекло · перезапуск источника', globals: Glass.globals }
export const GlassUnavailable: StoryObj<typeof meta> = { ...SmtcUnavailable, name: 'Стекло · нет связи с Windows', globals: Glass.globals }
export const GlassLongTrack: StoryObj<typeof meta> = { ...LongTrack, name: 'Стекло · длинное название в узком островке', globals: Glass.globals }
