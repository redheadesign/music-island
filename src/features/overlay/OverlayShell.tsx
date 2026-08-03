import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Pin, PinOff, Settings2 } from 'lucide-react'
import type { IslandAppState } from '../../app/useIslandApp'
import {
  getCollapsedGestureState,
  onCollapsedGestureState,
  onIntroClosed,
  type CollapsedGestureState,
} from '../../app/tauriApi'
import { MusicModule } from '../music/MusicModule'
import { ActiveSelectionChip } from '../music/wave/ActiveSelectionChip'
import { useAppUpdater } from '../settings/useAppUpdater'
import {
  cancelOverlayWindowOperations,
  getOverlayBounds,
  syncOverlayWindow,
  type OverlayWindowPhase,
} from './overlayWindow'
import { HoverCoach } from './HoverCoach'
import { buildAccentTokens } from '../../shared/lib/accentTheme'
import { createTranslator, normalizeLocale } from '../../shared/i18n/messages'
import {
  getUiPrefs,
  islandUpdateSnoozePatch,
  shouldShowIslandUpdateBanner,
  trackUpdateFirstSeen,
  withUiPrefs,
} from '../../shared/lib/uiPrefs'
import { UpdateBanner } from '../../shared/ui/UpdateBanner'

interface OverlayShellProps {
  app: IslandAppState
}

interface ArtworkTheme {
  primary: string
  secondary: string
}

const FALLBACK_ARTWORK_THEME: ArtworkTheme = {
  primary: '26, 30, 40',
  secondary: '10, 12, 18',
}

const OPEN_PULL_THRESHOLD = 8
const OPEN_CLOSE_GRACE_MS = 280

export function OverlayShell({ app }: OverlayShellProps) {
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
  const updater = useAppUpdater(true)
  const locale = normalizeLocale(config?.appearance.locale)
  const t = useMemo(() => createTranslator(locale), [locale])
  const uiPrefs = getUiPrefs(config)
  const latestVersion = updater.result?.latestVersion ?? null
  const showIslandUpdate = shouldShowIslandUpdateBanner({
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
  const [windowPhase, setWindowPhase] = useState<OverlayWindowPhase>('collapsed')
  const [expandedVisible, setExpandedVisible] = useState(false)
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
    if (windowPhase !== 'opening' && windowPhase !== 'open') return

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
  windowPhaseRef.current = windowPhase
  const currentArtworkThemeRef = useRef<ArtworkTheme>(FALLBACK_ARTWORK_THEME)
  const [artworkTheme, setArtworkTheme] = useState<ArtworkTheme>(FALLBACK_ARTWORK_THEME)

  const showCollapsedLayer = windowPhase === 'collapsed'
  const showTopChrome = windowPhase === 'collapsed' || windowPhase === 'opening'

  const animateArtworkTheme = (targetTheme: ArtworkTheme) => {
    if (
      currentArtworkThemeRef.current.primary === targetTheme.primary
      && currentArtworkThemeRef.current.secondary === targetTheme.secondary
    ) return
    currentArtworkThemeRef.current = targetTheme
    setArtworkTheme(targetTheme)
  }

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
    let cancelled = false

    if (!media?.hasSession) {
      animateArtworkTheme(FALLBACK_ARTWORK_THEME)
      return () => {
        cancelled = true
      }
    }

    if (!media.thumbnailDataUrl) {
      return () => {
        cancelled = true
      }
    }

    extractArtworkTheme(media.thumbnailDataUrl).then((theme) => {
      if (!cancelled) {
        animateArtworkTheme(theme)
      }
    }).catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [media?.hasSession, media?.thumbnailDataUrl])

  useEffect(() => {
    if (!config || !isPinned) {
      return
    }

    if (windowPhase === 'collapsed' || windowPhase === 'closing') {
      openCommittedRef.current = true
      openedAtRef.current = performance.now()
      setExpandedVisible(false)
      setWindowPhase('opening')
    }
  }, [config, isPinned, mode, setMode, windowPhase])

  useEffect(() => {
    let cancelled = false
    const bounds = getOverlayBounds(config.layout.width, config.layout.scale)
    const phase = windowPhase
    void syncOverlayWindow(phase, bounds).then(async (applied) => {
      if (!applied) {
        return
      }
      if (phase === 'opening') {
        if (!openCommittedRef.current) {
          return
        }
        await nextPaint()
        if (cancelled || !openCommittedRef.current) return
        if (mode !== 'settings') {
          setMode('expanded')
        }
        setExpandedVisible(true)
        setWindowPhase('open')
      }
    })
    return () => {
      cancelled = true
    }
  }, [config.layout.scale, config.layout.width, mode, setMode, windowPhase])

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
      if (performance.now() - openedAtRef.current < OPEN_CLOSE_GRACE_MS) {
        return
      }
      if (phase === 'opening' && !expandedVisible) {
        return
      }
      if (!state.active) {
        if (phase === 'opening') {
          abortOpeningRef.current()
        } else {
          scheduleCloseRef.current()
        }
        return
      }
      if (isPointerOverExpandedSurface(state.localX, state.localY, state.windowWidth, state.windowHeight)) {
        setIsHoveringIsland(true)
        return
      }
      if (phase === 'opening') {
        abortOpeningRef.current()
      } else {
        scheduleCloseRef.current()
      }
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
  }, [expandedVisible, windowPhase])

  const accentTokens = useMemo(
    () => buildAccentTokens(config?.appearance.accentColor ?? '#F76100'),
    [config?.appearance.accentColor],
  )

  const style = useMemo(() => {
    if (!config) {
      return undefined
    }

    return {
      '--island-opacity': config.appearance.opacity,
      '--island-radius': `${config.appearance.cornerRadius}px`,
      '--island-blur': `${config.appearance.blurStrength}px`,
      '--island-scale': config.layout.scale / 100,
      '--island-width': config.layout.width / 100,
      '--island-layout-width': `${500 * (config.layout.width / 100) + 112}px`,
      '--island-hit-width': `${(500 * (config.layout.width / 100) + 112) * (config.layout.scale / 100)}px`,
      '--accent': accentTokens.accent,
      '--accent-soft': accentTokens.accentSoft,
      '--accent-strong': accentTokens.accentStrong,
      '--accent-rgb': accentTokens.accentRgb,
      '--accent-glow': accentTokens.accentGlow,
      '--accent-muted': accentTokens.accentMuted,
      '--accent-ink': accentTokens.accentInk,
      '--artwork-primary': artworkTheme.primary,
      '--artwork-secondary': artworkTheme.secondary,
    } as CSSProperties
  }, [accentTokens, artworkTheme.primary, artworkTheme.secondary, config])

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
    setExpandedVisible(false)
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
      }
      topContactRef.current = true
      clearPeekResetTimer()
      startEdgePressure()
    } else if (distanceToTop > 12) {
      topContactRef.current = false
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

  const handleExpandedExitComplete = () => {
    if (windowPhase !== 'closing') {
      return
    }

    setMode(media?.hasSession ? 'compact' : 'no-session')
    resetPeekVisuals()
    stripArmedRef.current = false
    setWindowPhase('collapsed')
  }

  const scheduleClose = () => {
    clearCloseTimer()
    if (config.behavior.pinExpanded || mode === 'settings') {
      return
    }

    if (windowPhaseRef.current !== 'open') {
      return
    }

    if (performance.now() - openedAtRef.current < OPEN_CLOSE_GRACE_MS) {
      return
    }

    setIsHoveringIsland(false)
    setWindowPhase('closing')
    setExpandedVisible(false)
  }

  const handleExpandedHoverEnter = () => {
    setIsHoveringIsland(true)
    clearCloseTimer()
    if (windowPhase === 'closing') {
      setWindowPhase('open')
      setMode('expanded')
      setExpandedVisible(true)
      openedAtRef.current = performance.now()
    }
  }

  const handleExpandedHoverLeave = () => {
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

  return (
    <main
      className={[
        'island-root',
        `island-root--${mode}`,
        `island-root--${windowPhase}`,
        `theme-${config.appearance.theme}`,
        `size-${config.layout.size}`,
        showCollapsedLayer ? 'island-root--collapsed' : '',
        expandedVisible ? 'island-root--expanded' : '',
        config.appearance.reducedMotion ? 'reduced-motion' : '',
      ].join(' ')}
      style={style}
    >
      <div className="island-stage">
      {hoverCoachActive && windowPhase === 'collapsed' ? (
        <HoverCoach label={t('island.hoverCoach')} />
      ) : null}
      {showTopChrome ? (
        <div
          className={[
            'island-top-chrome',
            windowPhase === 'opening' ? 'island-top-chrome--opening' : '',
          ].join(' ')}
        >
          <div
            className={[
              'edge-trigger',
              windowPhase === 'collapsed' && peekProgress > 0.001 ? 'edge-trigger--peeking' : '',
            ].join(' ')}
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
            <span className="edge-peek" aria-hidden="true" />
            <span
              className={[
                'collapsed-progress',
                hideCollapsedProgress || (isPeekGesture && peekProgress > 0.08) ? 'collapsed-progress--hidden' : '',
              ].join(' ')}
            >
              <span
                className="collapsed-progress__fill"
                style={{ transform: `scaleX(${progressPercent / 100})` }}
              />
            </span>
          </div>
        </div>
      ) : null}

      <AnimatePresence onExitComplete={handleExpandedExitComplete}>
        {expandedVisible ? (
          <div className="island-expanded-layer">
            <motion.div
              className="island-hover-zone"
              key="island-expanded"
              onPointerEnter={handleExpandedHoverEnter}
              onPointerLeave={handleExpandedHoverLeave}
              initial={config.appearance.reducedMotion ? false : { opacity: 0, y: -18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{
                duration: config.appearance.reducedMotion ? 0 : 0.26,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
            <div className="island-scale-layer">
            <section className="island-card">
              <MusicModule
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
                onCommand={(command) => void sendCommand(command)}
                showDirectReload={showDirectReload}
                directReloadBusy={directReloadBusy}
                onDirectReload={() => void handleDirectReload()}
              />
            </section>
            {showIslandUpdate ? (
              <UpdateBanner
                variant="island"
                title={t('island.updateTitle')}
                primaryLabel={t('island.updateNow')}
                laterLabel={t('island.updateLater')}
                onPrimary={() => {
                  void openSettingsWindow()
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
            </div>

            {/* Outside scale() so mix-blend-mode: difference can see past the card. */}
            <header
              className="island-actions"
              aria-label="Overlay actions"
              style={
                {
                  '--actions-scale': config.layout.scale / 100,
                } as CSSProperties
              }
            >
              <button
                type="button"
                className="icon-button"
                aria-label="Open settings"
                onClick={() => void openSettingsWindow()}
              >
                <Settings2 size={16} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={config.behavior.pinExpanded ? 'Unpin island' : 'Pin island'}
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
                    setExpandedVisible(true)
                  }
                }}
              >
                {config.behavior.pinExpanded ? <PinOff size={16} /> : <Pin size={16} />}
              </button>
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

function isPointerOverExpandedSurface(
  localX: number,
  localY: number,
  windowWidth: number,
  windowHeight: number,
): boolean {
  if (windowWidth <= 0 || windowHeight <= 0) {
    return false
  }

  const viewportX = localX * (window.innerWidth / windowWidth)
  const viewportY = localY * (window.innerHeight / windowHeight)
  const element = document.elementFromPoint(viewportX, viewportY)
  return Boolean(element?.closest(
    '.island-hover-zone, .island-actions, .island-plugins, .island-card, .island-update-rail, .wave-wheel, .wave-selection-chip',
  ))
}

function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

async function extractArtworkTheme(dataUrl: string): Promise<ArtworkTheme> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = dataUrl
  await image.decode()

  const canvas = document.createElement('canvas')
  const size = 32
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return FALLBACK_ARTWORK_THEME
  }

  context.drawImage(image, 0, 0, size, size)
  const data = context.getImageData(0, 0, size, size).data
  const buckets = new Map<string, { r: number; g: number; b: number; score: number; count: number }>()

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3]
    if (alpha < 180) {
      continue
    }

    const r = data[index]
    const g = data[index + 1]
    const b = data[index + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const saturation = max - min
    const brightness = (r + g + b) / 3
    if (brightness < 18 || brightness > 238 || saturation < 18) {
      continue
    }

    const key = `${Math.round(r / 32)},${Math.round(g / 32)},${Math.round(b / 32)}`
    const current = buckets.get(key) ?? { r: 0, g: 0, b: 0, score: 0, count: 0 }
    current.r += r
    current.g += g
    current.b += b
    current.count += 1
    current.score += saturation * 1.4 + (255 - brightness) * 0.35
    buckets.set(key, current)
  }

  const best = [...buckets.values()].sort((a, b) => b.score - a.score)[0]
  if (!best) {
    return FALLBACK_ARTWORK_THEME
  }

  const r = Math.round(best.r / best.count)
  const g = Math.round(best.g / best.count)
  const b = Math.round(best.b / best.count)

  return {
    primary: `${darken(r, 0.72)}, ${darken(g, 0.72)}, ${darken(b, 0.72)}`,
    secondary: `${darken(r, 0.32)}, ${darken(g, 0.32)}, ${darken(b, 0.32)}`,
  }
}

function darken(value: number, factor: number): number {
  return Math.max(0, Math.min(255, Math.round(value * factor)))
}
