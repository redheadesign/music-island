import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'
import { expect, fireEvent, fn, userEvent, waitFor, within } from 'storybook/test'
import seaStack from '../../assets/preview-sea-stack.webp'
import { OverlayShell } from '../../features/overlay/OverlayShell'
import type { IslandAppState, OverlayMode } from '../../app/useIslandApp'
import type { MediaSnapshot } from '../../shared/lib/types'
import type { LocalServer } from '../../shared/lib/localServerTypes'
import type { AdvancedGlassOverrides } from '../../shared/lib/advancedGlass'
import { normalizeInterfaceTheme, type InterfaceThemeId } from '../../shared/lib/interfaceTheme'
import { getIslandLayout, moveIslandElement, withIslandLayout } from '../../shared/lib/islandLayout'
import { getUiPrefs } from '../../shared/lib/uiPrefs'
import { media, health } from '../fixtures'
import { emitPreviewPlaybackBass, getPreviewPlaybackBassRequest } from '../mocks/tauriApi'
import { previewReducedTransparency } from '../mocks/reducedTransparency'
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
  startCollapsed = false,
  playbackWaveEnabled = true,
  advancedGlass,
  factoryAppearance = false,
  includeSeek = false,
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
  artwork?: 'warm' | 'cool' | 'mixed' | 'missing'
  reducedMotion?: boolean
  startCollapsed?: boolean
  playbackWaveEnabled?: boolean
  advancedGlass?: AdvancedGlassOverrides
  factoryAppearance?: boolean
  includeSeek?: boolean
}) {
  const [config, setConfig] = useWorkshopConfig(locale, accent, !startCollapsed && localServersMode !== 'collapsed' && latestMessageMode !== 'collapsed', interfaceTheme, factoryAppearance)
  const [localServers, setLocalServers] = useState(() => {
    if (localServersMode === 'empty') return []
    if (localServersMode === 'stoppable') return demoLocalServers.map((server) => ({ ...server, canStop: true }))
    return demoLocalServers
  })
  const usage = useUsageController(assistantLimits)
  const connectUsage = usage.connect
  useEffect(() => { if (assistantLimits) void connectUsage('codex') }, [assistantLimits, connectUsage])
  const [mode, setMode] = useState<OverlayMode>(startCollapsed ? 'compact' : 'expanded')
  const [track, setTrack] = useState<MediaSnapshot>({
    ...media,
    hasSession: !empty,
    thumbnailDataUrl: artwork === 'missing' ? null : artwork === 'warm' ? media.thumbnailDataUrl : alternateCovers[artwork],
  })
  const composition = includeSeek ? withIslandLayout(config,
    moveIslandElement(moveIslandElement(getIslandLayout(config), 'seekBack', 'player'), 'seekForward', 'player')) : config
  const ui = getUiPrefs(composition)
  const app: IslandAppState = {
    config: {
      ...config,
      appearance: { ...config.appearance, reducedMotion },
      layout: { ...config.layout, width, scale },
      media: { ...config.media, protocol: unavailable ? 'smtc' : 'yandex-direct', directYandexConsent: !unavailable },
      plugins: {
        ...config.plugins,
        enabled: latestMessageMode ? ['dictation'] : config.plugins.enabled,
        settings: {
          ...config.plugins.settings,
          ui: { ...ui, ...(advancedGlass && { advancedGlass }), playbackWaveEnabled, localServersEnabled: ui.localServersEnabled ?? Boolean(localServersMode), localServersWidgetScale, showLatestDictationMessage: Boolean(latestMessageMode), forceIslandUpdateBanner: update && !ui.islandUpdateSnoozedUntil },
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
    configLoaded: true, configLoadFailed: false, retryConfigLoad: () => {},
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
        if (command === 'next' || command === 'previous') {
          const second = value.trackId === media.trackId
          return { ...value, trackId: second ? 'workshop-track-two' : media.trackId, title: second ? 'Night Walk' : media.title, positionMs: 0 }
        }
        if (command === 'like') return { ...value, isLiked: !value.isLiked }
        if (command === 'dislike') return { ...value, isDisliked: !value.isDisliked }
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
const alternateCovers = {
  cool: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#1885d4"/><circle cx="112" cy="90" r="58" fill="#19afbb"/></svg>')}`,
  mixed: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#cfaa0f"/><rect x="127" width="73" height="200" fill="#9124be"/></svg>')}`,
}
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
export const FactoryGlass: StoryObj<typeof meta> = {
  ...Glass, name: 'Стекло · заводской пресет', args: { factoryAppearance: true, width: 117, scale: 82, localServersMode: 'expanded' },
  parameters: { workshop: { backdrop: seaStack } },
  play: async ({ canvasElement }) => {
    const surface = await waitFor(() => {
      const node = canvasElement.querySelector<HTMLElement>('.island-root[data-interface-palette="grove"]')
      expect(node).toBeInTheDocument()
      return node!
    })
    await expect(surface.style.getPropertyValue('--glass-frost-strength')).toBe('0.86')
    await waitFor(() => expect(canvasElement.querySelector('.island-local-servers')).toBeInTheDocument())
    await waitFor(() => expect(canvasElement.querySelector('.island-feedback__ambient')).toHaveAttribute('data-bass-gain', '3'))
  },
}
export const AdvancedGlassSurfaces: StoryObj<typeof meta> = {
  ...Glass,
  name: 'Стекло · независимые поверхности',
  args: {
    includeSeek: true,
    advancedGlass: {
      body: { transparency: 75, background: '#242c2c', bend: .45, dispersion: .4, frost: 6.5 },
      transport: { rim: .23, bend: .45, dispersion: .4, frost: 1 },
      buttons: { bend: .45, dispersion: .4, frost: 7.5 },
      progressTrack: { radius: 14, height: 48, text: '#fff0d0', textSize: 15, frost: 12 },
      progressFill: { radius: 1.25, brightness: 135 },
    },
  },
  play: async ({ canvasElement }) => {
    const root = await waitFor(() => {
      const element = canvasElement.querySelector<HTMLElement>('.island-root--open[data-glass-scope]:has(.progress-track .progress-fill)')
      expect(element).toBeInTheDocument()
      return element!
    })
    if (matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)').matches) return
    const track = root.querySelector<HTMLElement>('.progress-track')!
    const fill = track.querySelector<HTMLElement>('.progress-fill')!
    const card = root.querySelector<HTMLElement>('.island-card')!
    const lens = root.querySelector<HTMLElement>('.island-card .lg-glass')!
    await expect(root.querySelectorAll('filter[id^="glass-optics-"]')).toHaveLength(1)
    await expect(getComputedStyle(lens).boxShadow).toBe('none')
    await expect(getComputedStyle(lens).backdropFilter).toContain('blur(6.5px)')
    await expect(parseFloat(getComputedStyle(card).getPropertyValue('--glass-region-blur'))).toBeCloseTo(4.875)
    // Older profiles contained player-only optics. They must not recreate the
    // diagonal reflection on the desktop after an upgrade.
    root.dataset.nativeBackdrop = 'active'
    await expect(getComputedStyle(lens, '::after').backgroundImage).toBe('none')
    await expect(getComputedStyle(lens).backdropFilter).toBe('none')
    const innerButtons = [...card.querySelectorAll('.media-button, .reaction-button')]
    await expect(innerButtons.length).toBeGreaterThanOrEqual(3)
    await expect(card.querySelectorAll('.seek-step-button')).toHaveLength(2)
    await expect(card.querySelectorAll('.reaction-button')).toHaveLength(2)
    for (const button of innerButtons) {
      await expect(getComputedStyle(button).backdropFilter).toContain('blur(7.5px)')
      await expect(getComputedStyle(button).backdropFilter).toContain('glass-optics-')
    }
    const detached = root.querySelector('.island-actions .icon-button')
    if (detached) await expect(getComputedStyle(detached).backdropFilter).toBe('none')
    await expect(getComputedStyle(track).backdropFilter).toContain('blur(12px)')
    await expect(getComputedStyle(fill).userSelect).toBe('none')
    delete root.dataset.nativeBackdrop
    await expect(getComputedStyle(track).backdropFilter).toContain('blur(12px)')
    await expect(getComputedStyle(track).height).toBe('48px')
    await expect(getComputedStyle(track).borderRadius).toBe('14px')
    await expect(getComputedStyle(track.querySelector('.progress-content')!).color).toBe('rgb(255, 240, 208)')
    await expect(getComputedStyle(fill).borderRadius).toBe('1.25px')
    await expect(getComputedStyle(fill).getPropertyValue('--progress-fill-tone-weight').trim()).toBe('35%')
  },
}
export const GlassOpticalSurface: StoryObj<typeof meta> = {
  ...Glass,
  name: 'Стекло · оптический край островка',
  parameters: { workshop: { backdrop: seaStack } },
  args: { artwork: 'cool' },
  play: async ({ canvasElement }) => {
    const card = await waitFor(() => {
      const element = canvasElement.querySelector<HTMLElement>('.island-card[data-island-optical]')
      expect(element).toBeInTheDocument()
      return element!
    })
    const frame = card.querySelector<HTMLElement>(':scope > .island-glass-optic')!
    await expect(card.closest('.island-root')!.querySelector(':scope > style, filter[id^="glass-optics-"]')).toBeNull()
    await expect(frame).toHaveAttribute('aria-hidden', 'true')
    await expect(getComputedStyle(frame).pointerEvents).toBe('none')
    await expect(getComputedStyle(frame).overflow).toBe('hidden')
    await expect(frame.querySelector('button, a, input')).toBeNull()
    const button = card.querySelector('button')!
    await expect(getComputedStyle(button).filter).toBe('none')
    const lens = frame.querySelector(':scope > .lg-glass')!
    if (matchMedia('(prefers-reduced-transparency: reduce), (forced-colors: active), (prefers-contrast: more)').matches) {
      await expect(lens).not.toBeVisible()
      return
    }
    const radius = parseFloat(getComputedStyle(card).borderBottomLeftRadius)
    await expect(radius).toBeGreaterThan(0)
    await expect(parseFloat(getComputedStyle(lens).borderTopLeftRadius)).toBe(radius)
    await expect(parseFloat(getComputedStyle(lens).top)).toBe(-radius)
    // The first rendered surface has its optical field, with one displacement pass.
    if (/Chrom(?:e|ium)\//.test(navigator.userAgent)) {
      await expect(getComputedStyle(lens).backdropFilter).toContain('glisse-bezel-')
      await expect(frame.querySelectorAll('feDisplacementMap')).toHaveLength(1)
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const move = (target: Element, x: number, y: number) => target.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: x, clientY: y }),
    )
    const edge = card.getBoundingClientRect()
    move(card, edge.left + 2, edge.top + edge.height / 2)
    await new Promise(requestAnimationFrame)
    await expect(card).not.toHaveAttribute('data-glass-light')
    await expect(getComputedStyle(lens).boxShadow).toBe('none')
    await expect(getComputedStyle(lens, '::before').content).toBe('none')
    for (const control of card.querySelectorAll<HTMLButtonElement>('button:enabled')) {
      const { left, top, width, height } = control.getBoundingClientRect()
      move(control.querySelector('svg, span') ?? control, left + width / 2, top + height / 2)
      await waitFor(() => expect(control).toHaveAttribute('data-glass-light'))
      await expect(card).not.toHaveAttribute('data-glass-light')
      const idle = getComputedStyle(lens, '::after')
      await expect(idle.opacity).toBe('0')
      await expect(idle.backgroundImage).toBe('none')
      await expect(idle.transitionDuration).toBe('0s')
    }
    move(card, edge.left + edge.width / 2, edge.top + edge.height / 2)
    await new Promise(requestAnimationFrame)
    await expect(card.querySelector('[data-glass-light]')).toBeNull()
    await expect(card).not.toHaveAttribute('data-glass-light')
  },
}
export const GlassControlLenses: StoryObj<typeof meta> = {
  ...Glass,
  name: 'Стекло · кнопки плеера рядом с виджетом Codex',
  args: { artwork: 'cool', assistantLimits: true },
  globals: { ...Glass.globals, locale: 'en', accent: '#f76100' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const previous = await canvas.findByRole('button', { name: /^(?:Previous|Предыдущий трек)$/ })
    const pause = canvas.getByRole('button', { name: /^(?:Pause|Пауза)$/ })
    const next = canvas.getByRole('button', { name: /^(?:Next|Следующий трек)$/ })
    const like = canvas.getByRole('button', { name: 'Like' })
    const dislike = canvas.getByRole('button', { name: 'Dislike' })
    const settings = canvas.getByRole('button', { name: 'Open settings' })
    const seek = canvas.getByRole('slider', { name: /Позиция трека|Seek track/ })
    const documentView = canvasElement.ownerDocument.defaultView!
    const forcedColors = documentView.matchMedia('(forced-colors: active)').matches
    const restingLikeRim = documentView.getComputedStyle(like).boxShadow
    const restingDislikeRim = documentView.getComputedStyle(dislike).boxShadow
    if (!forcedColors && !documentView.matchMedia('(prefers-reduced-transparency: reduce)').matches) {
      for (const button of [previous, pause, next, like, dislike, seek]) {
        await expect(documentView.getComputedStyle(button).backdropFilter).toBe('none')
      }
      await expect(documentView.getComputedStyle(settings).backdropFilter).toContain('blur(')
      await expect(documentView.getComputedStyle(seek).backgroundColor).not.toBe(documentView.getComputedStyle(next).backgroundColor)
      await expect(documentView.getComputedStyle(pause).backgroundColor).not.toBe(documentView.getComputedStyle(next).backgroundColor)
      const fill = seek.querySelector('.progress-fill')!
      await expect(parseFloat(documentView.getComputedStyle(fill).height)).toBeLessThan(seek.getBoundingClientRect().height / 4)
      for (const reaction of [like, dislike]) {
        await expect(documentView.getComputedStyle(reaction).backdropFilter).toBe(documentView.getComputedStyle(previous).backdropFilter)
        await expect(documentView.getComputedStyle(reaction).backgroundColor).toBe(documentView.getComputedStyle(previous).backgroundColor)
      }
      const codex = canvasElement.querySelector('.usage-chip__compact-provider[data-usage-provider="codex"]')!
      await expect(documentView.getComputedStyle(codex).boxShadow).not.toContain('inset')
    }
    await expect(documentView.getComputedStyle(settings).boxShadow).not.toBe('none')
    if (!forcedColors && !documentView.matchMedia('(prefers-reduced-transparency: reduce)').matches) {
      await expect(documentView.getComputedStyle(settings).backgroundColor).not.toBe(documentView.getComputedStyle(previous).backgroundColor)
    }
    await userEvent.click(previous)
    await expect(onCommand).toHaveBeenLastCalledWith('previous')
    await userEvent.tab()
    await expect(pause).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(canvas.getByRole('button', { name: /^(?:Play|Воспроизвести)$/ })).toHaveFocus()
    await userEvent.click(next)
    await expect(onCommand).toHaveBeenLastCalledWith('next')
    // Changing the track remounts the reaction glyphs to reset their animations.
    const currentDislike = canvas.getByRole('button', { name: 'Dislike' })
    const currentLike = canvas.getByRole('button', { name: 'Like' })
    await userEvent.click(currentDislike)
    await expect(currentDislike).toHaveAttribute('aria-pressed', 'true')
    await expect(currentDislike.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
    if (!forcedColors) await expect(documentView.getComputedStyle(currentDislike).boxShadow).toBe(restingDislikeRim)
    await userEvent.click(currentDislike)
    await userEvent.click(currentLike)
    await expect(currentLike).toHaveAttribute('aria-pressed', 'true')
    await expect(currentLike.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
    if (!forcedColors) {
      await expect(documentView.getComputedStyle(currentLike).boxShadow).toBe(restingLikeRim)
    }
    await userEvent.tab()
    await expect(settings).toHaveFocus()
    await expect(documentView.getComputedStyle(settings).outlineStyle).not.toBe('none')
    await userEvent.click(settings)
    await expect(openSettings).toHaveBeenCalled()
  },
}
export const GlassControlLensesReducedTransparency: StoryObj<typeof meta> = {
  ...GlassControlLenses,
  name: 'Стекло · кнопки с пониженной прозрачностью',
  beforeEach: previewReducedTransparency,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const settings = await canvas.findByRole('button', { name: 'Open settings' })
    const seek = canvas.getByRole('slider', { name: /Позиция трека|Seek track/ })
    await expect(settings.closest('.island-root')).toHaveAttribute('data-reduced-transparency', 'true')
    await expect(canvasElement.querySelector('.island-glass-optic .lg-glass')).not.toBeVisible()
    await expect(canvasElement.querySelector('.island-glass-optic feDisplacementMap')).toBeNull()
    await expect(canvasElement.ownerDocument.defaultView!.getComputedStyle(settings).backdropFilter).toBe('none')
    await expect(canvasElement.ownerDocument.defaultView!.getComputedStyle(seek).backdropFilter).toBe('none')
  },
}
export const GlassCoolCover: StoryObj<typeof meta> = {
  ...Glass, name: 'Стекло · рябь и прогресс в цветах обложки', args: { artwork: 'cool' },
  play: async ({ canvasElement }) => {
    const forcedColors = matchMedia('(forced-colors: active)').matches
    const island = canvasElement.querySelector<HTMLElement>('.island-root')!
    await waitFor(() => expect(island).toHaveAttribute('data-cover-art', 'true'))
    const blue = Number(island.style.getPropertyValue('--artwork-primary').split(',')[2])
    await expect(blue).toBeGreaterThan(190)
    await waitFor(async () => {
      const progress = canvasElement.querySelector('.progress-fill')
      await expect(progress).toBeInTheDocument()
      const style = getComputedStyle(progress!)
      if (forcedColors) {
        await expect(style.backgroundImage).toBe('none')
        await expect(style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
      } else {
        await expect(style.backgroundImage).toContain('linear-gradient')
      }
    })
    const fill = canvasElement.querySelector('.progress-fill')!
    const frame = canvasElement.querySelector('.progress-visual')!
    const backdrop = canvasElement.querySelector('.island-card .island-feedback__ambient')!
    await expect(fill.getBoundingClientRect().height).toBeCloseTo(frame.getBoundingClientRect().height)
    await expect(getComputedStyle(frame, '::before').content).toBe('none')
    await expect(getComputedStyle(frame, '::after').content).toBe('none')
    if (!forcedColors && !matchMedia('(prefers-reduced-transparency: reduce)').matches) {
      await expect(getComputedStyle(backdrop, '::before').backgroundImage).toContain('radial-gradient')
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const front = getComputedStyle(backdrop, '::before')
        const following = getComputedStyle(backdrop, '::after')
        await expect(front.animationName).toContain('island-glass-wave-launch')
        await expect(following.transformOrigin).toBe(front.transformOrigin)
        await expect(Number.parseFloat(following.animationDelay)).toBeGreaterThan(0)
      }
    }
    if (!forcedColors && !matchMedia('(prefers-reduced-motion: reduce)').matches && !matchMedia('(prefers-reduced-transparency: reduce)').matches) {
      const particles = [...canvasElement.querySelectorAll('.island-particles > i')]
      await expect(particles.length).toBeGreaterThan(2)
      await expect(new Set(particles.map(particle => getComputedStyle(particle).animationDelay)).size).toBe(particles.length)
      await expect(getComputedStyle(particles[0]).animationName).toBe('island-particle-fall')
    }
  },
}
export const GlassWithoutCover: StoryObj<typeof meta> = { ...Glass, name: 'Стекло · нейтральный прогресс без обложки', args: { artwork: 'missing' } }
export const GlassReactiveWave: StoryObj<typeof meta> = {
  ...Glass, name: 'Стекло · волна реагирует на бас', args: { artwork: 'cool' },
  globals: { ...Glass.globals, locale: 'en' },
  play: async ({ canvasElement }) => {
    if (matchMedia('(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce), (forced-colors: active)').matches) return
    const layer = await waitFor(() => {
      const node = canvasElement.querySelector<HTMLElement>('.island-card .island-feedback__ambient')
      expect(node).toBeInTheDocument()
      return node!
    })
    const nextRequest = (previous?: number) => waitFor(() => {
      const request = getPreviewPlaybackBassRequest()
      expect(request).toBeDefined()
      expect(request).not.toBe(previous)
      return request!
    }, { timeout: 4000 })
    const initial = await nextRequest()
    const canvas = within(canvasElement)
    const fronts = () => layer.getAnimations({ subtree: true }).filter(
      animation => animation instanceof CSSAnimation && animation.animationName === 'island-glass-wave-out',
    )
    async function checkMotion(request: number) {
      const waves = await waitFor(() => { const items = fronts(); expect(items).toHaveLength(2); return items })
      const opacity = () => waves.map(wave => (wave.effect as KeyframeEffect).getKeyframes().map(frame => frame.opacity))
      const baseOpacity = opacity()
      emitPreviewPlaybackBass(1, request)
      await expect(waves.every(wave => wave.playbackRate > 1 && wave.playbackRate <= 1.141)).toBe(true)
      await expect(opacity()).toEqual(baseOpacity)
      await expect(baseOpacity[0]).toContain('0.32')
    }

    const particles = [...layer.querySelectorAll('.island-particles > i')]
    await checkMotion(initial)
    await userEvent.click(canvas.getByRole('button', { name: /^(?:Next|Следующий)$/ }))
    const skipped = await nextRequest(initial)
    emitPreviewPlaybackBass(1, initial)
    await expect(layer.style.getPropertyValue('--island-wave-drive')).toBe('')
    await checkMotion(skipped)

    const seek = canvas.getByRole('slider', { name: /^(?:Seek track|Позиция трека)$/ })
    seek.focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(Number(seek.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    // The Direct stream briefly ends during seek; the displayed transport remains Playing.
    const recovered = await nextRequest(skipped)
    await checkMotion(recovered)

    await userEvent.click(canvas.getByRole('button', { name: /^(?:Pause|Пауза)$/ }))
    await waitFor(() => expect(getPreviewPlaybackBassRequest()).toBeUndefined())
    await expect(layer).toHaveAttribute('data-playback-motion', 'paused')
    await expect(getComputedStyle(layer, '::before').animationName).toBe('island-glass-wave-in')
    await expect(getComputedStyle(layer.querySelector('.island-particles')!).display).toBe('block')
    await userEvent.click(canvas.getByRole('button', { name: /^(?:Play|Воспроизвести)$/ }))
    const resumed = await nextRequest(recovered)
    await expect(getComputedStyle(layer, '::before').animationName).toContain('island-glass-wave-launch')
    emitPreviewPlaybackBass(1, recovered)
    await expect(layer.style.getPropertyValue('--island-wave-drive')).toBe('')
    await checkMotion(resumed)
    await expect([...layer.querySelectorAll('.island-particles > i')]).toEqual(particles)
  },
}
export const GlassBackgroundOff: StoryObj<typeof meta> = {
  ...Glass, name: 'Стекло · фон отключён', args: { artwork: 'cool', playbackWaveEnabled: false },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector('.island-card')).toBeVisible())
    const ambient = canvasElement.querySelector<HTMLElement>('.island-feedback__ambient')!
    await expect(ambient).not.toHaveAttribute('data-playback-wave')
    await expect(getComputedStyle(ambient, '::before').content).toBe('none')
    await expect(ambient.querySelector('.island-particles')).toBeInTheDocument()
    await expect(getPreviewPlaybackBassRequest()).toBeUndefined()
    await waitFor(() => expect(canvasElement.querySelector('.island-root')).toHaveAttribute('data-cover-art', 'true'))
  },
}
export const GlassEdge: StoryObj<typeof meta> = {
  ...Glass,
  name: 'Стекло · верхняя кромка при наведении',
  args: { startCollapsed: true },
  parameters: { workshop: { width: 850, height: 400, note: 'Подведите указатель к полосе, затем к её верхней границе, чтобы раскрыть плеер.' } },
}
export const GlassEdgeGesture: StoryObj<typeof meta> = {
  ...GlassEdge, name: 'Стекло · отклик и раскрытие от верхней кромки',
  play: async ({ args, canvasElement }) => {
    const trigger = canvasElement.querySelector<HTMLElement>('.edge-trigger')!
    const cue = trigger.querySelector('.edge-peek')!
    const island = canvasElement.querySelector('.island-root')!
    const rect = trigger.getBoundingClientRect()
    const center = rect.left + rect.width / 2
    const approach = { clientX: center, clientY: rect.top + 9, pointerType: 'mouse' }
    const contact = { ...approach, clientY: rect.top + 1 }

    await expect(document.elementFromPoint(approach.clientX, approach.clientY)).toBe(trigger)
    await expect(island).toHaveClass('island-root--collapsed')
    await expect(cue).not.toBeVisible()
    fireEvent.pointerOver(trigger, approach)
    fireEvent.pointerMove(trigger, approach)
    await waitFor(() => expect(cue).toBeVisible())
    await expect(island).toHaveClass('island-root--collapsed')
    if (args.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await expect(getComputedStyle(cue).transitionDuration).toBe('0s')
    }

    fireEvent.pointerOut(trigger, { ...approach, clientY: rect.bottom + 20, relatedTarget: canvasElement })
    await waitFor(() => expect(trigger).not.toHaveClass('edge-trigger--peeking'))
    await waitFor(() => expect(cue).not.toBeVisible())
    await expect(island).toHaveClass('island-root--collapsed')

    fireEvent.pointerOver(trigger, contact)
    fireEvent.pointerMove(trigger, contact)
    await waitFor(() => expect(cue).toBeVisible())
    await waitFor(() => expect(island).toHaveClass('island-root--open'), { timeout: 2000 })
    await expect(within(canvasElement).getByRole('button', { name: /^(?:Pause|Пауза)$/ })).toBeInTheDocument()
  },
}
export const GlassEdgeReducedMotion: StoryObj<typeof meta> = {
  ...GlassEdgeGesture, name: 'Стекло · верхняя кромка без движения', args: { startCollapsed: true, reducedMotion: true },
}
export const GlassReducedMotion: StoryObj<typeof meta> = {
  ...Glass, name: 'Стекло · фон без движения', args: { reducedMotion: true },
  play: async ({ canvasElement }) => {
    const backdrop = await waitFor(() => {
      const node = canvasElement.querySelector('.island-card .island-feedback__ambient')
      expect(node).toBeInTheDocument()
      return node!
    })
    await expect(backdrop.querySelector('.island-particles')).not.toBeVisible()
    await expect(getComputedStyle(backdrop, '::before').animationName).toBe('none')
    await expect(getComputedStyle(backdrop, '::after').content).toBe('none')
  },
}
export const GlassPlayback: StoryObj<typeof meta> = {
  ...Glass,
  globals: { ...Glass.globals, locale: 'en' },
  name: 'Стекло · воспроизведение и пауза на обложке',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = await canvas.findByRole('button', { name: /^(?:Pause|Пауза)$/ })
    await waitFor(() => expect(button).toBeVisible())
    const artwork = canvasElement.querySelector('.artwork-shell')!
    const buttonRect = button.getBoundingClientRect()
    const artworkRect = artwork.getBoundingClientRect()
    await expect(getComputedStyle(button).position).toBe('absolute')
    const center = { x: buttonRect.left + buttonRect.width / 2, y: buttonRect.top + buttonRect.height / 2 }
    await expect(center.x).toBeCloseTo(artworkRect.left + artworkRect.width / 2, 0)
    await expect(center.y).toBeCloseTo(artworkRect.top + artworkRect.height / 2, 0)
    await expect(button.contains(canvasElement.ownerDocument.elementFromPoint(center.x, center.y))).toBe(true)
    const ambient = canvasElement.querySelector<HTMLElement>('.island-card .island-feedback__ambient')!
    const quiet = matchMedia('(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce), (forced-colors: active)').matches
    const playingOpacity = matchMedia('(prefers-contrast: more)').matches ? '0.42' : '1'
    const animations = () => ambient.getAnimations({ subtree: true }).filter((animation) => animation instanceof CSSAnimation)
    if (!quiet) {
      await waitFor(() => expect(getComputedStyle(ambient).opacity).toBe(playingOpacity))
      await expect(animations().length).toBeGreaterThan(2)
    }
    await userEvent.click(button)
    await waitFor(() => expect(canvas.getByRole('button', { name: /^(?:Play|Воспроизвести)$/ })).toBeVisible())
    if (!quiet) {
      await expect(getComputedStyle(ambient, '::before').animationName).toBe('island-glass-wave-in')
      const returning = animations().filter(a => a instanceof CSSAnimation && a.animationName === 'island-glass-wave-in')
      await expect(returning).toHaveLength(2)
      await Promise.all(returning.map(animation => animation.finished))
      await expect(getComputedStyle(ambient, '::before').opacity).toBe('0')
      await expect(getComputedStyle(ambient, '::after').opacity).toBe('0')
      await expect(getComputedStyle(ambient.querySelector('.island-particles')!).display).toBe('block')
    }
    await userEvent.keyboard(' ')
    await waitFor(() => expect(canvas.getByRole('button', { name: /^(?:Pause|Пауза)$/ })).toBeVisible())
    if (!quiet) {
      await waitFor(() => expect(getComputedStyle(ambient).opacity).toBe(playingOpacity))
      await expect(animations().length).toBeGreaterThan(2)
    }
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
    const address = rows[0].querySelector('code')!.getBoundingClientRect()
    const process = rows[0].querySelector('.island-local-servers__address span')!.getBoundingClientRect()
    await expect(process.left).toBeGreaterThan(address.right)
    await expect(process.top).toBeLessThan(address.bottom)
    await expect(rows[0].getBoundingClientRect().height).toBeLessThan(45)
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
    for (const widget of [servers, latest]) {
      const style = getComputedStyle(widget)
      await expect(style.borderWidth).toBe('0px')
      await expect(style.boxShadow).not.toContain('inset')
    }
  },
}

export const GlassWidgetPanels: StoryObj<typeof meta> = {
  ...LatestDictationExpanded,
  name: 'Стекло · Codex, серверы и последняя запись',
  args: { ...LatestDictationExpanded.args, assistantLimits: true },
  globals: { interfaceTheme: 'glass' },
  parameters: { workshop: { height: 720, backdrop: seaStack } },
  play: async (context) => {
    await LatestDictationExpanded.play!(context)
    const { canvasElement } = context
    // The three widgets mount inside the animated drawer. Native data can
    // already be present in the first render, while its opacity is still zero.
    const drawer = canvasElement.querySelector<HTMLElement>('.island-hover-zone')!
    const deadline = performance.now() + 4000
    while (getComputedStyle(drawer).opacity !== '1' && performance.now() < deadline) {
      await new Promise(requestAnimationFrame)
    }
    await expect(drawer).toHaveStyle({ opacity: '1' })
    const surfaces = ['.usage-chip__compact-provider', '.island-local-servers', '.island-latest-dictation']
      .map(selector => canvasElement.querySelector<HTMLElement>(selector)!)
    for (const surface of surfaces) {
      await expect(surface).toBeVisible()
      await expect(surface).toHaveClass('island-surface')
      await expect(surface.querySelector('.island-glass-optic')).toBeNull()
    }
    if (matchMedia('(forced-colors: active), (prefers-reduced-transparency: reduce), (prefers-contrast: more)').matches) return
    const [provider, servers, latest] = surfaces.map(surface => getComputedStyle(surface))
    const player = canvasElement.querySelector<HTMLElement>('.island-card')!
    // Artwork colors remain in the progress and wave. The base has no
    // directional highlight in the top-left corner.
    await expect(getComputedStyle(player).backgroundImage).toBe('none')
    await expect(provider.backgroundColor).toBe(servers.backgroundColor)
    await expect(latest.backgroundColor).toBe(servers.backgroundColor)
    await expect(servers.backgroundColor).toMatch(/^rgba\(.+, 0\.\d+\)$/)
    for (const surface of [provider, servers, latest]) {
      await expect(surface.backdropFilter).toContain('blur(')
      await expect(surface.backgroundImage).toBe(servers.backgroundImage)
    }
    const root = player.closest<HTMLElement>('.island-root')!
    const previousEdge = root.style.getPropertyValue('--glass-edge-strength')
    try {
      root.style.setProperty('--glass-edge-strength', '0')
      const thin = getComputedStyle(surfaces[0]).backgroundSize
      root.style.setProperty('--glass-edge-strength', '1')
      for (const surface of surfaces) {
        await expect(getComputedStyle(surface).backgroundSize).toBe(thin)
      }
    } finally {
      root.style.setProperty('--glass-edge-strength', previousEdge)
    }
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
