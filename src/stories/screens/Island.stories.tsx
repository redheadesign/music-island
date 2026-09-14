import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'
import { fn } from 'storybook/test'
import { OverlayShell } from '../../features/overlay/OverlayShell'
import type { IslandAppState, OverlayMode } from '../../app/useIslandApp'
import type { MediaSnapshot } from '../../shared/lib/types'
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
  update = false,
  longTrack = false,
  assistantLimits = false,
}: {
  locale: 'ru' | 'en'
  accent: string
  empty?: boolean
  recovery?: boolean
  restarting?: boolean
  unavailable?: boolean
  width?: number
  update?: boolean
  longTrack?: boolean
  assistantLimits?: boolean
}) {
  const [config, setConfig] = useWorkshopConfig(locale, accent, true)
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
      layout: { ...config.layout, width },
      media: { ...config.media, protocol: unavailable ? 'smtc' : 'yandex-direct' },
      plugins: {
        ...config.plugins,
        settings: {
          ...config.plugins.settings,
          ui: { ...ui, forceIslandUpdateBanner: update && !ui.islandUpdateSnoozedUntil },
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
  return <OverlayShell app={app} usage={usage} />
}
const noop = async () => {}
const onCommand = fn().mockName('island.command')
const openSettings = fn(async () => {}).mockName('island.openSettings')
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
export const Empty: StoryObj<typeof meta> = {
  name: 'Яндекс Музыка недоступна',
  args: { empty: true },
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
