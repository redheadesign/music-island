import { useSystemReducedTransparency } from '../../shared/ui/useSystemReducedTransparency'
import { IslandFeedback } from '../../shared/ui/PressFeedback'
import { useAdvancedGlass } from '../../shared/ui/useAdvancedGlass'
import { getGlassMaterial, glassMaterialStyle } from '../../shared/lib/glassMaterial'
import { normalizeDesktopGlassMode, normalizeDesktopLens } from '../../shared/lib/advancedGlass'
import { progressTrackKey } from '../music/progressTransition'
import { createIslandBassEffect } from '../../shared/ui/islandBassEffect'
import { IslandActionButton } from '../../shared/ui/IslandActionButton'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLatestDictationMessage, useLocalServersController, useNativeBackdrop, usePlaybackBass, type IslandAppState, type LatestDictationMessageController, type LocalServersController, type UsageController } from '../../app/useIslandApp'
import { islandArrangement, getIslandLayout, inlineActionsWidth } from '../../shared/lib/islandLayout'
import {
  getCollapsedGestureState,
  onCollapsedGestureState,
  onIntroClosed,
  onIslandReveal,
  setOverlayBounds,
  setOverlayWidgetRegions,
  type CollapsedGestureState,
} from '../../app/tauriApi'
import { MusicModule } from '../music/MusicModule'
import { IslandSystemVolume } from './IslandSystemVolume'
import { DictationMicrophone } from '../dictation/DictationMicrophone'
import { ActiveSelectionChip } from '../music/wave/ActiveSelectionChip'
import { useAppUpdater } from '../settings/useAppUpdater'
import {
  cancelOverlayWindowOperations,
  deferOverlayClose,
  getOverlayBounds,
  shouldDeferOverlayClose,
  measureExpandedHitBand,
  measureOverlayWidgetRect,
  syncOverlayWindow,
  type OverlayWindowPhase,
} from './overlayWindow'
import { transitionOverlay, type OverlayTransition } from './overlayTransition'
import { IslandTopIndicator } from './IslandTopIndicator'
import { artworkCssColors, progressFillColor, readArtworkPalette, type ArtworkPalette } from './artworkPalette'
import { HoverCoach } from './HoverCoach'
import { LocalServersPanel } from './LocalServersPanel'
import { LatestDictationPanel } from './LatestDictationPanel'
import { createTranslator, normalizeLocale } from '../../shared/i18n/messages'
import {
  getInterfacePalette,
  getInterfacePaletteStyle,
  getInterfaceTheme,
  getLocalServersWidgetScale,
  getPlaybackWaveEnabled,
  usesGlassMaterial,
  getUiPrefs,
  getUsageWidgetCompact,
  getUsageWidgetScale,
  islandUpdateSnoozePatch,
  shouldShowIslandUpdateBanner,
  trackUpdateFirstSeen,
  withUiPrefs,
} from '../../shared/lib/uiPrefs'
import { UpdateBanner } from '../../shared/ui/UpdateBanner'
import { UsageStatusChip } from '../usage/UsageStatusChip'

interface OverlayShellProps {
  app: IslandAppState
  usage?: UsageController
  localServers?: LocalServersController
  latestDictation?: LatestDictationMessageController
}

const OPEN_PULL_THRESHOLD = 8
const DISMISSED_DICTATION_KEY = 'island-dismissed-dictation'

export function OverlayShell({ app, usage, localServers, latestDictation }: OverlayShellProps) {
  const {
    config,
    media,
    mode,
    progressMs,
    progressPercent,
    setMode,
    sendCommand,
    waveContext,
    clearWaveSelection,
    openSettingsWindow,
    updateConfig,
    directNeedsRecovery,
    directReloadBusy,
    restartDirect,
  } = app
  const uiPrefs = getUiPrefs(config)
  const usageScale = getUsageWidgetScale(config)
  const usageCompact = getUsageWidgetCompact(config)
  const islandLayout = useMemo(() => getIslandLayout(config), [config])
  const arrangement = islandArrangement(islandLayout)
  const systemReducedMotion = useReducedMotion()
  const reducedMotion = config.appearance.reducedMotion || Boolean(systemReducedMotion)
  const hasUsage = islandLayout.zones.left.length + islandLayout.zones.right.length > 0
  const maxRailProviders = Math.max(islandLayout.zones.left.length, islandLayout.zones.right.length)
  const actionCount = islandLayout.zones.actions.length
  const estimatedBounds = useMemo(() => getOverlayBounds(config.layout.width, config.layout.scale, {
    visible: hasUsage, scale: usageScale, compact: usageCompact, visibleWhenCollapsed: false, maxProviders: maxRailProviders,
  }, arrangement, actionCount), [config.layout.width, config.layout.scale, hasUsage, usageScale, usageCompact, maxRailProviders, arrangement, actionCount])
  const gestureBounds = useRef<{ generation: number; bounds: typeof estimatedBounds; result: Promise<boolean> } | null>(null)
  const updater = useAppUpdater(true, Boolean(uiPrefs.forceSameVersionUpdate))
  const locale = normalizeLocale(config?.appearance.locale)
  const t = useMemo(() => createTranslator(locale), [locale])
  const latestVersion = updater.result?.latestVersion ?? null
  const updaterBusy =
    updater.status === 'downloading' || updater.status === 'installing'
  // Check failures (offline / GitHub) must not surface on the island — only in Settings About.
  const showIslandUpdate =
    updaterBusy
    || shouldShowIslandUpdateBanner({
      hasUpdate: Boolean(updater.result?.hasUpdate) || uiPrefs.forceIslandUpdateBanner === true,
      latestVersion: latestVersion ?? (uiPrefs.forceIslandUpdateBanner ? 'dev' : null),
      prefs: uiPrefs,
    })

  useEffect(() => {
    if (!config || !updater.result?.hasUpdate || !updater.result.latestVersion) return
    const patch = trackUpdateFirstSeen(getUiPrefs(config), updater.result.latestVersion)
    if (!patch) return
    void updateConfig(withUiPrefs(config, patch))
  }, [config, updateConfig, updater.result?.hasUpdate, updater.result?.latestVersion])

  const dismissIslandUpdate = () => {
    if (!config) return
    void updateConfig(
      withUiPrefs(config, islandUpdateSnoozePatch(latestVersion ?? 'dev')),
    )
  }

  const isPinned = Boolean(config?.behavior.pinExpanded)
  const directEnabled = config?.media.protocol === 'yandex-direct'
  const showDirectReload = Boolean(
    directEnabled
    && (directNeedsRecovery || (media?.provider === 'yandex-direct' && !media.hasSession)),
  )
  const handleDirectReload = async () => {
    try {
      const status = await restartDirect()
      if (status.state === 'connected') {
        await sendCommand('play')
        if (config) {
          await updateConfig({
            ...config,
            media: {
              ...config.media,
              protocol: 'yandex-direct',
              directYandexConsent: true,
              directYandexPort: status.port,
            },
          })
        }
      }
    } catch (error) {
      console.error('Direct quick reload failed', error)
    }
  }
  const [transition, setTransition] = useState<OverlayTransition>({ phase: 'collapsed', generation: 0 })
  const transitionRef = useRef(transition)
  const windowPhase = transition.phase
  const expandedVisible = windowPhase === 'open'
  const expandedMounted = expandedVisible || windowPhase === 'opening'
  const [edgeContact, setEdgeContact] = useState(false)
  const [firstOpenPending, setFirstOpenPending] = useState(true)
  const preparing = firstOpenPending && windowPhase === 'collapsed' && edgeContact
  const hasSession = media?.hasSession === true
  const reducedTransparency = useSystemReducedTransparency()
  const hasPlaybackWave = hasSession && getPlaybackWaveEnabled(config)
  const playbackStatus = media?.playbackStatus
  const playbackMotion = hasSession && (playbackStatus === 'changing' || playbackStatus === 'opened' || playbackStatus === 'closed')
    ? null : hasSession && playbackStatus === 'playing'
  const overlay = useRef<HTMLElement>(null)
  const glassMaterial = useMemo(() => getGlassMaterial(config), [config])
  const advanced = useAdvancedGlass(usesGlassMaterial(config) ? uiPrefs.advancedGlass : undefined, glassMaterial)
  const glassMode = normalizeDesktopGlassMode(uiPrefs.desktopGlassMode)
  const desktopLens = useMemo(() => glassMode === 'system' ? undefined : {
    ...normalizeDesktopLens(uiPrefs.desktopLens), snapshot: glassMode === 'snapshot', reducedMotion: Boolean(reducedMotion),
  }, [glassMode, uiPrefs.desktopLens, reducedMotion])
  const glassBackdrop = usesGlassMaterial(config) && !reducedTransparency
  const nativeBackdrop = useNativeBackdrop(overlay, glassBackdrop,
    '.island-surface, [data-island-control="floating"]', glassMaterial.frost / 100, advanced.regionFrostKey, desktopLens,
    windowPhase === 'opening' || windowPhase === 'open' || (windowPhase === 'collapsed' && edgeContact)
      ? advanced.nativeBodyFrost : undefined)
  const ambientRef = useRef<HTMLSpanElement>(null)
  const bassEffect = useRef<ReturnType<typeof createIslandBassEffect> | null>(null)
  const applyBassLevel = useCallback((bass?: number) => {
    const layer = ambientRef.current
    if (bass === undefined || bassEffect.current?.layer !== layer) {
      bassEffect.current?.dispose()
      bassEffect.current = null
    }
    if (bass === undefined || !layer) return
    if (!bassEffect.current && bass > 0) bassEffect.current = createIslandBassEffect(layer)
    bassEffect.current?.update(bass)
  }, [])
  usePlaybackBass(
    expandedVisible && hasPlaybackWave && playbackMotion === true
      && !reducedMotion && !reducedTransparency
      && config.media.protocol === 'yandex-direct' && config.media.directYandexConsent && media?.provider === 'yandex-direct',
    applyBassLevel,
    media ? `${media.generation ?? 0}:${progressTrackKey(media)}` : '',
  )
  const localServersEnabled = islandLayout.zones.bottom.includes('localServers')
  const discoveredServers = useLocalServersController(localServersEnabled && expandedVisible && !localServers)
  const localServersController = localServers ?? discoveredServers
  const showLocalServers = expandedVisible && localServersEnabled && localServersController.servers.length > 0
  const localServersRef = useRef<HTMLElement | null>(null)
  const latestAllowed = config.plugins.enabled.includes('dictation') && uiPrefs.showLatestDictationMessage === true
  const history = useLatestDictationMessage(latestAllowed && !latestDictation)
  const { message, copy } = latestDictation ?? history
  const [dismissedMessage, setDismissedMessage] = useState(() => {
    try { return latestDictation ? null : localStorage.getItem(DISMISSED_DICTATION_KEY) } catch { return null }
  })
  const messageKey = message ? `${message.timestamp}:${message.id}` : null
  const showLatestMessage = expandedVisible && latestAllowed && Boolean(messageKey && messageKey !== dismissedMessage && message?.text.trim())
  const latestMessageRef = useRef<HTMLElement | null>(null)
  const setWindowPhase = useCallback((phase: OverlayWindowPhase, expected?: number) => {
    const next = transitionOverlay(transitionRef.current, phase, expected)
    transitionRef.current = next
    windowPhaseRef.current = next.phase
    setTransition(next)
    return next
  }, [])
  const [, setIsHoveringIsland] = useState(false)
  const [hoverCoachActive, setHoverCoachActive] = useState(false)
  const [peekProgress, setPeekProgress] = useState(0)
  const [peekX, setPeekX] = useState(110)
  const [hideCollapsedProgress, setHideCollapsedProgress] = useState(false)
  const [isPeekGesture, setIsPeekGesture] = useState(false)
  const [chromePeek, setChromePeek] = useState({ progress: 0, peekX: 110 })

  useEffect(() => {
    if (!isTauriRuntime() || !config) return
    if (getUiPrefs(config).hoverCoachCompleted) return

    let active = true
    let cleanup: () => void = () => {}
    void onIntroClosed(() => {
      if (!active || getUiPrefs(config).hoverCoachCompleted) return
      setHoverCoachActive(true)
      setPeekProgress(0.42)
      setPeekX(110)
      setIsPeekGesture(true)
    }).then((unlisten) => {
      if (active) cleanup = unlisten
      else unlisten()
    })

    return () => {
      active = false
      cleanup()
    }
  }, [config])

  useEffect(() => {
    if (!hoverCoachActive || !config) return
    if (windowPhase !== 'open') return

    setHoverCoachActive(false)
    setIsPeekGesture(false)
    if (!getUiPrefs(config).hoverCoachCompleted) {
      void updateConfig(withUiPrefs(config, { hoverCoachCompleted: true }))
    }
  }, [config, hoverCoachActive, updateConfig, windowPhase])

  const closeTimerRef = useRef<number | null>(null)
  const pressureTimerRef = useRef<number | null>(null)
  const peekResetTimerRef = useRef<number | null>(null)
  const lastPointerYRef = useRef<number | null>(null)
  const lastLocalYRef = useRef<number | null>(null)
  const topContactRef = useRef(false)
  const topEdgeContactAtRef = useRef<number | null>(null)
  const postTopPullRef = useRef(0)
  const pressureLastTickRef = useRef(0)
  const edgeProximityRef = useRef(0)
  const centerMagnetRef = useRef(0)
  const openCommittedRef = useRef(false)
  const gestureActiveRef = useRef(false)
  const windowPhaseRef = useRef<OverlayWindowPhase>('collapsed')
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const scheduleCloseRef = useRef<() => void>(() => undefined)
  const abortOpeningRef = useRef<() => void>(() => undefined)
  const resetPeekVisualsRef = useRef<() => void>(() => undefined)
  const hoverZoneRef = useRef<HTMLDivElement | null>(null)
  const gestureHandlersRef = useRef({
    beginPeekGesture: (_clientX: number, _clientY: number, _localX: number, _stripWidth: number) => {},
    processGestureSample: (
      _stripWidth: number,
      _stripHeight: number,
      _localX: number,
      _localY: number,
      _clientX: number,
      _clientY: number,
    ) => {},
    handlePointerLeave: () => {},
  })
  const stripArmedRef = useRef(true)
  const openedAtRef = useRef(0)
  const revealHoldUntilRef = useRef(0)
  windowPhaseRef.current = windowPhase
  const publishWidgetRegions = useCallback(() => {
    const expanded = windowPhaseRef.current === 'open'
    const servers = expanded ? localServersRef.current : null
    const latest = expanded ? latestMessageRef.current : null
    void setOverlayWidgetRegions({
      localServers: servers ? measureOverlayWidgetRect(servers) : null,
      latestMessage: latest ? measureOverlayWidgetRect(latest) : null,
    }).catch(() => undefined)
  }, [])
  const artworkSource = media?.hasSession ? media.thumbnailDataUrl : undefined
  const [resolvedArtwork, setResolvedArtwork] = useState<{ source: string; palette: ArtworkPalette } | null>(null)
  const artworkPalette = resolvedArtwork && resolvedArtwork.source === artworkSource ? resolvedArtwork.palette : null

  const progressColor = useMemo(() => artworkPalette ? progressFillColor(artworkPalette.primary) : undefined, [artworkPalette])

  const showCollapsedLayer = windowPhase === 'collapsed'
  const showTopChrome = windowPhase !== 'closing'

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current)
      }
      if (pressureTimerRef.current) {
        window.clearInterval(pressureTimerRef.current)
      }
      if (peekResetTimerRef.current) {
        window.clearTimeout(peekResetTimerRef.current)
      }
      cancelOverlayWindowOperations()
    }
  }, [])

  useEffect(() => {
    let current = true
    if (!artworkSource) return
    void readArtworkPalette(artworkSource).catch(() => null).then(palette => {
      if (current) setResolvedArtwork(palette ? { source: artworkSource, palette } : null)
    })
    return () => { current = false }
  }, [artworkSource])

  useEffect(() => {
    if (!config || !isPinned) {
      return
    }

    if (windowPhase === 'collapsed' || windowPhase === 'closing') {
      openCommittedRef.current = true
      openedAtRef.current = performance.now()

      setWindowPhase('opening')
    }
  }, [config, isPinned, mode, setMode, windowPhase, setWindowPhase])

  useLayoutEffect(() => {
    // Once input is active, ResizeObserver owns the measured (possibly asymmetric) band.
    if (windowPhase === 'open') return
    let cancelled = false
    const phase = windowPhase
    const generation = transitionRef.current.generation
    const pending = gestureBounds.current
    const result = phase === 'opening' && pending?.generation === generation && pending.bounds === estimatedBounds
      ? pending.result : syncOverlayWindow(phase, estimatedBounds)
    void result.then((applied) => {
      if (!applied || cancelled || generation !== transitionRef.current.generation) {
        return
      }
      if (phase === 'opening') {
        if (!openCommittedRef.current) {
          return
        }
        traceHover('inputReady')
        setFirstOpenPending(false)
        if (mode !== 'settings') {
          setMode('expanded')
        }

        setWindowPhase('open', generation)
      }
    }).catch(() => {
      if (cancelled || generation !== transitionRef.current.generation) return
      resetPeekVisualsRef.current()
      stripArmedRef.current = true
      setWindowPhase('collapsed', generation)
    })
    return () => {
      cancelled = true
    }
  }, [estimatedBounds, mode, setMode, windowPhase, setWindowPhase])

  useEffect(() => {
    if ((!showLocalServers && !showLatestMessage) || !isTauriRuntime()) return
    const observer = new ResizeObserver(publishWidgetRegions)
    for (const panel of [localServersRef.current, latestMessageRef.current]) {
      if (panel) observer.observe(panel)
    }
    if (hoverZoneRef.current) observer.observe(hoverZoneRef.current)
    window.addEventListener('resize', publishWidgetRegions)
    publishWidgetRegions()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', publishWidgetRegions)
      void setOverlayWidgetRegions({ localServers: null, latestMessage: null }).catch(() => undefined)
    }
  }, [showLocalServers, showLatestMessage, messageKey, config.layout.scale, publishWidgetRegions])

  // Native keep-alive band must cover Settings/Pin in *physical* px (DPR-aware).
  // 1.3.21 only hugged height in CSS px — on 125%/150% the band was too narrow and mid-path closed.
  useEffect(() => {
    if (!config || !expandedVisible || windowPhase !== 'open') {
      return
    }
    if (!isTauriRuntime()) {
      return
    }

    const zone = hoverZoneRef.current
    if (!zone) {
      return
    }

    const publish = () => {
      if (windowPhaseRef.current !== 'open') return
      const { width, height } = measureExpandedHitBand(zone)
      void setOverlayBounds(true, width, height).catch(() => undefined)
    }

    publish()
    const observer = new ResizeObserver(() => publish())
    observer.observe(zone)
    zone.querySelectorAll('.island-card, .island-actions, .island-usage-rail').forEach((part) => observer.observe(part))
    return () => observer.disconnect()
  }, [
    config,
    expandedVisible,
    windowPhase,
    showIslandUpdate,
    waveContext?.active,
  ])

  useEffect(() => {
    if (!isTauriRuntime() || windowPhase !== 'collapsed') {
      return
    }

    const scale = config.layout.scale / 100
    const stripWidth = 220 * scale
    const stripHeight = 20 * scale
    let active = true

    const processState = (state: CollapsedGestureState) => {
      if (!active || windowPhaseRef.current !== 'collapsed') {
        return
      }

      const handlers = gestureHandlersRef.current
      if (!state.active) {
        stripArmedRef.current = true
        if (gestureActiveRef.current) {
          handlers.handlePointerLeave()
        }
        return
      }

      if (!stripArmedRef.current) {
        return
      }

      const localXViewport = toViewportX(state.localX, state.windowWidth)
      const localYViewport = toViewportY(state.localY, state.windowHeight)
      const stripLeft = (window.innerWidth - stripWidth) / 2
      const inStripX =
        localXViewport >= stripLeft - 6 && localXViewport <= stripLeft + stripWidth + 6

      if (!inStripX) {
        if (gestureActiveRef.current) {
          handlers.handlePointerLeave()
        }
        return
      }

      const stripLocalX = localXViewport - stripLeft
      if (!gestureActiveRef.current) {
        handlers.beginPeekGesture(state.clientX, state.clientY, stripLocalX, stripWidth)
      }
      handlers.processGestureSample(
        stripWidth,
        stripHeight,
        stripLocalX,
        localYViewport,
        state.clientX,
        state.clientY,
      )
    }

    let cleanup: () => void = () => undefined
    void onCollapsedGestureState(processState).then((unlisten) => {
      if (active) cleanup = unlisten
      else unlisten()
    })
    void getCollapsedGestureState().then(processState)

    return () => {
      active = false
      cleanup()
    }
  }, [windowPhase, config.layout.scale])

  useEffect(() => {
    if (!isTauriRuntime()) {
      return
    }

    if (windowPhase !== 'open' && windowPhase !== 'opening') {
      return
    }

    let active = true

    const processState = (state: CollapsedGestureState) => {
      if (!active) {
        return
      }

      const phase = windowPhaseRef.current
      if (phase !== 'open' && phase !== 'opening') {
        return
      }

      lastPointerRef.current = { x: state.clientX, y: state.clientY }
      if (state.active) {
        revealHoldUntilRef.current = 0
        if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      if (phase === 'opening' && (!expandedVisible || shouldDeferOverlayClose(performance.now(), openedAtRef.current, revealHoldUntilRef.current))) {
        return
      }
      // Keep-alive is the native hit-band only. DOM elementFromPoint is unreliable across
      // DPI/scale (false misses in the card→Settings gutter close the island on some monitors).
      if (!state.active) {
        if (phase === 'opening') {
          abortOpeningRef.current()
        } else {
          scheduleCloseRef.current()
        }
        return
      }
      setIsHoveringIsland(true)
    }

    let cleanup: () => void = () => undefined
    let receivedEvent = false
    void onCollapsedGestureState(state => {
      receivedEvent = true
      processState(state)
    }).then(unlisten => {
      if (!active) { unlisten(); return }
      cleanup = unlisten
      void getCollapsedGestureState().then(state => { if (!receivedEvent) processState(state) })
    })

    return () => {
      active = false
      cleanup()
    }
  }, [expandedVisible, windowPhase])

  // Visibility never depends on an exit callback from a removed/re-entered tree.
  // The opening deadline also recovers a rejected or stalled native bounds request.
  useEffect(() => {
    if (transition.phase !== 'closing' && transition.phase !== 'opening') return
    const generation = transition.generation
    const timer = window.setTimeout(() => {
      if (transitionRef.current.generation !== generation) return
      cancelOverlayWindowOperations()
      resetPeekVisualsRef.current()
      stripArmedRef.current = true
      setMode(media?.hasSession ? 'compact' : 'no-session')
      setWindowPhase('collapsed', generation)
    }, transition.phase === 'opening' ? 1500 : reducedMotion ? 0 : 280)
    return () => window.clearTimeout(timer)
  }, [transition, reducedMotion, media?.hasSession, setMode, setWindowPhase])

  useEffect(() => {
    let active = true
    let cleanup = () => {}
    void onIslandReveal(() => {
      if (!active) return
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
      openCommittedRef.current = true
      openedAtRef.current = performance.now()
      revealHoldUntilRef.current = openedAtRef.current + 3000

      setWindowPhase('opening')
    }).then((unlisten) => { if (active) cleanup = unlisten; else unlisten() }).catch(() => undefined)
    return () => { active = false; cleanup() }
  }, [setWindowPhase])

  const style = useMemo(() => {
    if (!config) {
      return undefined
    }

    const artworkColors = artworkCssColors(artworkPalette, usesGlassMaterial(config))
    return {
      '--island-opacity': config.appearance.opacity,
      '--island-radius': `${config.appearance.cornerRadius}px`,
      '--island-blur': `${config.appearance.blurStrength}px`,
      '--island-scale': config.layout.scale / 100,
      '--usage-scale': getUsageWidgetScale(config),
      '--island-action-count': islandLayout.zones.actions.length,
      '--inline-actions-width': `${inlineActionsWidth(islandLayout.zones.actions.length)}px`,
      '--island-width': config.layout.width / 100,
      '--island-layout-width': `${500 * (config.layout.width / 100) + 112}px`,
      '--island-hit-width': `${(500 * (config.layout.width / 100) + 112) * (config.layout.scale / 100)}px`,
      ...getInterfacePaletteStyle(config),
      ...glassMaterialStyle(glassMaterial),
      '--artwork-progress-color': progressColor,
      '--artwork-primary': artworkColors.primary,
      '--artwork-secondary': artworkColors.secondary,
    } as CSSProperties
  }, [artworkPalette, config, glassMaterial, islandLayout.zones.actions.length, progressColor])

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const clearPeekResetTimer = () => {
    if (peekResetTimerRef.current) {
      window.clearTimeout(peekResetTimerRef.current)
      peekResetTimerRef.current = null
    }
  }

  const stopEdgePressure = () => {
    if (pressureTimerRef.current) {
      window.clearInterval(pressureTimerRef.current)
      pressureTimerRef.current = null
    }
    pressureLastTickRef.current = 0
  }

  const resetPeekVisuals = () => {
    stopEdgePressure()
    setPeekProgress(0)
    setHideCollapsedProgress(false)
    setIsPeekGesture(false)
    lastPointerYRef.current = null
    lastLocalYRef.current = null
    topContactRef.current = false
    setEdgeContact(false)
    topEdgeContactAtRef.current = null
    postTopPullRef.current = 0
    openCommittedRef.current = false
    gestureActiveRef.current = false
    edgeProximityRef.current = 0
    centerMagnetRef.current = 0
  }

  const getTopEdgeContactDuration = () => {
    if (!topEdgeContactAtRef.current) {
      return 0
    }
    return performance.now() - topEdgeContactAtRef.current
  }

  const canOpenFromGesture = () => {
    if (!config || !gestureActiveRef.current || !topContactRef.current) {
      return false
    }

    return (
      getTopEdgeContactDuration() >= config.behavior.hoverDelayMs &&
      postTopPullRef.current >= OPEN_PULL_THRESHOLD
    )
  }

  const updatePeekProgress = () => {
    const pullProgress = Math.min(postTopPullRef.current / 5, 1)
    const nextProgress = Math.min(
      1,
      edgeProximityRef.current * 0.34 + centerMagnetRef.current * 0.18 + pullProgress * 0.58,
    )
    setPeekProgress(nextProgress)
  }

  const abortOpening = () => {
    if (windowPhaseRef.current !== 'opening' || isPinned) {
      return
    }

    cancelOverlayWindowOperations()
    openCommittedRef.current = false
    stripArmedRef.current = false
    resetPeekVisuals()

    setIsHoveringIsland(false)
    setWindowPhase('collapsed')
  }

  const openIsland = () => {
    if (openCommittedRef.current || windowPhaseRef.current !== 'collapsed' || !gestureActiveRef.current || !topContactRef.current) {
      return
    }

    if (!topContactRef.current || edgeProximityRef.current < 0.4) {
      return
    }

    openCommittedRef.current = true
    traceHover('accepted')
    gestureActiveRef.current = false
    stripArmedRef.current = false
    openedAtRef.current = performance.now()
    setIsPeekGesture(false)
    clearPeekResetTimer()
    stopEdgePressure()
    clearCloseTimer()
    setChromePeek({
      progress: peekProgress,
      peekX,
    })
    setHideCollapsedProgress(true)
    setWindowPhase('opening')
    // Issue the native hit-band request while React mounts the controls.
    const result = syncOverlayWindow('opening', estimatedBounds)
    gestureBounds.current = { generation: transitionRef.current.generation, bounds: estimatedBounds, result }
    void result.catch(() => {}) // The matching transition effect handles a rejected or cancelled request.
    setEdgeContact(false)
  }

  const requestOpenIsland = () => {
    if (!canOpenFromGesture()) {
      return
    }
    openIsland()
  }

  const startEdgePressure = () => {
    if (pressureTimerRef.current || openCommittedRef.current) {
      return
    }

    pressureLastTickRef.current = performance.now()
    pressureTimerRef.current = window.setInterval(() => {
      if (
        !gestureActiveRef.current ||
        !topContactRef.current ||
        openCommittedRef.current ||
        windowPhaseRef.current !== 'collapsed'
      ) {
        stopEdgePressure()
        return
      }

      const now = performance.now()
      const deltaMs = Math.min(now - pressureLastTickRef.current, 48)
      pressureLastTickRef.current = now
      const pressureStepMs = Math.max(config.behavior.hoverDelayMs / OPEN_PULL_THRESHOLD, 10)
      postTopPullRef.current = Math.min(22, postTopPullRef.current + deltaMs / pressureStepMs)
      updatePeekProgress()
      requestOpenIsland()
    }, 33)
  }

  const processGestureSample = (
    stripWidth: number,
    stripHeight: number,
    localX: number,
    localY: number,
    clientX: number,
    clientY: number,
  ) => {
    if (!gestureActiveRef.current || !showCollapsedLayer || openCommittedRef.current) {
      return
    }

    lastPointerRef.current = { x: clientX, y: clientY }
    const distanceToTop = Math.max(localY, 0)
    const previousY = lastLocalYRef.current ?? localY
    const upwardDelta = Math.max(previousY - localY, 0)
    lastLocalYRef.current = localY
    lastPointerYRef.current = clientY

    const pointerX = clampPeekX(localX, stripWidth)
    const centerDistance = Math.abs(pointerX - stripWidth / 2) / (stripWidth / 2)
    const centerMagnet = 1 - Math.min(centerDistance, 1)
    const edgeProximity = 1 - Math.min(distanceToTop / stripHeight, 1)
    centerMagnetRef.current = centerMagnet
    edgeProximityRef.current = edgeProximity

    if (distanceToTop <= 3) {
      if (!topContactRef.current) {
        topEdgeContactAtRef.current = performance.now()
        traceHover('contact')
        setEdgeContact(true)
      }
      topContactRef.current = true
      clearPeekResetTimer()
      startEdgePressure()
    } else if (distanceToTop > 12 && topContactRef.current) {
      topContactRef.current = false
      setEdgeContact(false)
      topEdgeContactAtRef.current = null
      postTopPullRef.current = 0
      stopEdgePressure()
    }

    if (topContactRef.current) {
      postTopPullRef.current = Math.min(22, postTopPullRef.current + upwardDelta * 0.35)
    }

    setPeekX(pointerX)
    updatePeekProgress()
    requestOpenIsland()
  }

  const beginPeekGesture = (clientX: number, clientY: number, localX: number, stripWidth: number) => {
    if (!showCollapsedLayer || openCommittedRef.current || !stripArmedRef.current) {
      return
    }

    lastPointerRef.current = { x: clientX, y: clientY }
    clearPeekResetTimer()
    gestureActiveRef.current = true
    setIsPeekGesture(true)
    openCommittedRef.current = false
    lastPointerYRef.current = clientY
    lastLocalYRef.current = null
    topContactRef.current = false
    setEdgeContact(false)
    topEdgeContactAtRef.current = null
    postTopPullRef.current = 0
    edgeProximityRef.current = 0
    centerMagnetRef.current = 0
    setPeekX(clampPeekX(localX, stripWidth))
    setPeekProgress(0)
    setHideCollapsedProgress(false)
  }

  const startPeek = (event: PointerEvent<HTMLDivElement>) => {
    if (isTauriRuntime()) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    beginPeekGesture(event.clientX, event.clientY, event.clientX - rect.left, rect.width)
  }

  const updatePeek = (event: PointerEvent<HTMLDivElement>) => {
    if (isTauriRuntime()) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    processGestureSample(
      rect.width,
      rect.height,
      event.clientX - rect.left,
      event.clientY - rect.top,
      event.clientX,
      event.clientY,
    )
  }

  const handlePointerLeave = () => {
    gestureActiveRef.current = false
    stopEdgePressure()
    clearPeekResetTimer()

    if (windowPhaseRef.current === 'opening') {
      abortOpening()
      return
    }

    if (!openCommittedRef.current) {
      resetPeekVisuals()
    }
  }

  const scheduleClose = () => {
    clearCloseTimer()
    if (config.behavior.pinExpanded || mode === 'settings') {
      return
    }

    if (windowPhaseRef.current !== 'open') {
      return
    }

    closeTimerRef.current = deferOverlayClose(performance.now(), openedAtRef.current, revealHoldUntilRef.current, () => scheduleCloseRef.current())
    if (closeTimerRef.current !== null) return

    setIsHoveringIsland(false)
    setWindowPhase('closing')

  }

  const handleExpandedHoverEnter = () => {
    setIsHoveringIsland(true)
    clearCloseTimer()
    if (windowPhase === 'closing') {
      setWindowPhase('open')
      setMode('expanded')

      openedAtRef.current = performance.now()
    }
  }

  const handleExpandedHoverLeave = () => {
    // In Tauri the native hit-band watcher owns close. DOM pointerleave fires on gaps /
    // transform quirks before the cursor reaches Settings/Pin on some DPI setups.
    if (isTauriRuntime()) {
      return
    }
    scheduleClose()
  }

  scheduleCloseRef.current = scheduleClose
  abortOpeningRef.current = abortOpening
  resetPeekVisualsRef.current = resetPeekVisuals
  gestureHandlersRef.current = {
    beginPeekGesture,
    processGestureSample,
    handlePointerLeave,
  }

  const localServersPanel = showLocalServers ? <LocalServersPanel ref={localServersRef} {...localServersController}
    locale={locale} contentScale={getLocalServersWidgetScale(config) / config.layout.scale} /> : null
  const latestMessagePanel = showLatestMessage && message ? <LatestDictationPanel
    key={messageKey} message={message} locale={locale} copy={copy}
    ref={latestMessageRef}
    dismiss={() => {
      setDismissedMessage(messageKey)
      if (!latestDictation && messageKey) {
        try { localStorage.setItem(DISMISSED_DICTATION_KEY, messageKey) } catch { /* Session state remains available. */ }
      }
    }} /> : null

  return (
    <main
      ref={overlay}
      data-native-backdrop={nativeBackdrop ?? (isTauriRuntime() ? 'pending' : undefined)}
      className={[
        'island-root',
        `island-root--${mode}`,
        `island-root--${windowPhase}`,
        `theme-${config.appearance.theme}`,
        `size-${config.layout.size}`,
        showCollapsedLayer ? 'island-root--collapsed' : '',
        expandedVisible ? 'island-root--expanded' : '',
        reducedMotion ? 'reduced-motion' : '',
      ].join(' ')}
      data-island-arrangement={arrangement}
      {...advanced.attributes}
      data-interface-theme={getInterfaceTheme(config)}
      data-interface-palette={getInterfacePalette(config)}
      data-cover-art={artworkPalette !== null || undefined}
      data-reduced-transparency={reducedTransparency || undefined}
      style={style}
    >
      {advanced.layers}
      <div className="island-stage">
      {hoverCoachActive && windowPhase === 'collapsed' ? (
        <HoverCoach label={t('island.hoverCoach')} />
      ) : null}
      {showTopChrome ? (
        <div
          className={[
            'island-top-chrome',
            expandedMounted ? 'island-top-chrome--opening' : '',
          ].join(' ')}
          inert={expandedMounted || undefined}
        >
          <div
            className={[
              'edge-trigger',
              windowPhase === 'collapsed' && peekProgress > 0.001 ? 'edge-trigger--peeking' : '',
            ].join(' ')}
            data-pointer-fallback={!isTauriRuntime() || undefined}
            style={
              {
                '--peek-progress': windowPhase === 'opening' ? chromePeek.progress : peekProgress,
                '--peek-x': `${windowPhase === 'opening' ? chromePeek.peekX : peekX}px`,
              } as CSSProperties
            }
            aria-hidden="true"
            onPointerEnter={startPeek}
            onPointerMove={updatePeek}
            onPointerLeave={handlePointerLeave}
            onPointerCancel={handlePointerLeave}
          >
            <IslandTopIndicator progressPercent={progressPercent} hidden={hideCollapsedProgress || (isPeekGesture && peekProgress > 0.08)} />
          </div>
        </div>
      ) : null}

      <AnimatePresence>
        {expandedMounted || preparing ? (
          <div className="island-expanded-layer" data-preparing={preparing || undefined} data-input-pending={!expandedVisible || undefined} inert={!expandedVisible || undefined}>
            <motion.div
              ref={hoverZoneRef}
              className="island-hover-zone"
              key="island-expanded"
              onPointerEnter={handleExpandedHoverEnter}
              onPointerLeave={handleExpandedHoverLeave}
              initial={reducedMotion ? false : { opacity: 0.12, y: -18 }}
              animate={preparing && !reducedMotion ? { opacity: 0.12, y: -18 } : { opacity: 1, y: 0 }}
              exit={preparing ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -10 }}
              onAnimationComplete={preparing ? undefined : publishWidgetRegions}
              transition={{
                duration: preparing || reducedMotion ? 0 : 0.26,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
            <div className="island-scale-layer">
            <IslandFeedback
              className="island-card island-surface"
              data-island-controls="nested"
              glassOptic={!preparing && usesGlassMaterial(config)}
              opticActive={!reducedTransparency && !isTauriRuntime()}
              particles={!preparing && usesGlassMaterial(config)}
              ambientRef={ambientRef}
              shaderTuning={uiPrefs.islandShader}
              playbackWave={!preparing && hasPlaybackWave}
              playbackMotion={playbackMotion}
            >
              <MusicModule
                systemVolume={<IslandSystemVolume locale={locale} enabled={!preparing} />}
                layout={islandLayout}
                media={media}
                progressMs={progressMs}
                progressPercent={progressPercent}
                density={config.layout.density}
                showArtwork={config.layout.showArtwork}
                showTitle={config.layout.showTitle}
                showArtist={config.layout.showArtist}
                showProgress={config.layout.showProgress && (windowPhase === 'open' || windowPhase === 'opening')}
                showSource={config.layout.showSource}
                showPreviousNext={config.layout.showPreviousNext}
                locale={config.appearance.locale}
                reducedMotion={preparing || config.appearance.reducedMotion}
                onCommand={(command) => void sendCommand(command)}
                showDirectReload={showDirectReload}
                directReloadBusy={directReloadBusy}
                onDirectReload={() => void handleDirectReload()}
              />
            </IslandFeedback>
            {showIslandUpdate ? (
              <UpdateBanner
                variant="island"
                title={t('island.updateTitle')}
                primaryLabel={t(updater.status === 'error' ? 'settings.updateRetry' : 'island.updateNow')}
                laterLabel={t('island.updateLater')}
                status={
                  updater.status === 'downloading' || updater.status === 'installing' || updater.status === 'error'
                    ? updater.status
                    : 'available'
                }
                progressPercent={updater.progress?.percent ?? null}
                error={updater.error}
                progressLabel={
                  updater.status === 'downloading'
                    ? t('settings.downloadingUpdate')
                    : updater.status === 'installing'
                      ? t('settings.installingUpdate')
                      : undefined
                }
                onPrimary={() => {
                  void updater.install()
                }}
                onLater={dismissIslandUpdate}
              />
            ) : null}
            {waveContext?.active ? (
              <ActiveSelectionChip
                selection={waveContext.active}
                onClear={() => void clearWaveSelection()}
              />
            ) : null}
            {localServersPanel || latestMessagePanel ? (
              <div className="island-bottom-rail">{localServersPanel}{latestMessagePanel}</div>
            ) : null}
            </div>

            {/* Outside scale() so mix-blend-mode: difference can see past the card. */}
            {(['left', 'right'] as const).map((side) => islandLayout.zones[side].length > 0 ? (
              <aside key={side} className={`island-usage-rail island-usage-rail--${side}`} aria-label={t('settings.usage')}>
                <UsageStatusChip snapshot={usage?.snapshot ?? null} enabledProviders={islandLayout.zones[side]} compact={usageCompact} locale={locale} />
              </aside>
            ) : null)}
            <header
              className="island-actions"
              aria-label="Overlay actions"
              style={
                {
                  '--actions-scale': config.layout.scale / 100,
                } as CSSProperties
              }
            >
              {islandLayout.zones.actions.map((action) => action === 'settings' ? <IslandActionButton
                key={action}
                action={action}
                label="Open settings"
                onClick={() => void openSettingsWindow()}
              /> : action === 'pin' ? <IslandActionButton
                key={action}
                action={action}
                active={config.behavior.pinExpanded}
                label={config.behavior.pinExpanded ? 'Unpin island' : 'Pin island'}
                onClick={() => {
                  const nextPinExpanded = !config.behavior.pinExpanded
                  void updateConfig({
                    ...config,
                    behavior: {
                      ...config.behavior,
                      pinExpanded: nextPinExpanded,
                    },
                  })
                  if (!nextPinExpanded) {
                    setMode('expanded')
                    setWindowPhase('open')

                  }
                }}
              /> : <DictationMicrophone key={action} enabled={!preparing && config.plugins.enabled.includes('dictation')} locale={locale} />)}
            </header>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
      </div>
    </main>
  )
}

function clampPeekX(value: number, width: number): number {
  return Math.max(42, Math.min(width - 42, value))
}

function toViewportX(localX: number, windowWidth: number): number {
  if (windowWidth <= 0) {
    return localX
  }

  return localX * (window.innerWidth / windowWidth)
}

function toViewportY(localY: number, windowHeight: number): number {
  if (windowHeight <= 0) {
    return localY
  }

  return localY * (window.innerHeight / windowHeight)
}

function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window
}

/** Installed for a local measurement run, absent during ordinary use. */
function traceHover(phase: 'contact' | 'accepted' | 'inputReady') {
  const target = window as Window & { __musicIslandHoverTrace?: (phase: string, timeMs: number) => void }
  target.__musicIslandHoverTrace?.(phase, performance.now())
}
