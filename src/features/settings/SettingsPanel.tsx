import { Activity, CheckCircle2, Copy, Info, Moon, Music2, PanelBottom, Pause, Power, RadioTower, SlidersHorizontal, SquareTerminal, Sun, TriangleAlert, Wrench } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  disableDirectYandex,
  enableDirectYandex,
  getDirectYandexStatus,
  onDirectYandexStatus,
  previewConfig,
  getDefaultConfig,
  getTaskbarStatus,
  onTaskbarStatus,
  openExternalUrl,
  openSpotify,
  replayIntroWindow,
} from '../../app/tauriApi'
import { VoiceSettingsView } from '../plugins/voice/VoiceSettingsView'
import { TaskbarLayoutEditor } from './TaskbarLayoutEditor'
import { IslandLayoutEditor } from './IslandLayoutEditor'
import { getLegacyIslandLayout, withIslandLayout } from '../../shared/lib/islandLayout'
import { BrandLogo } from '../../shared/ui/BrandLogo'
import { WarpMaterial } from '../../shared/ui/WarpMaterial'
import { UsageStatusChip } from '../usage/UsageStatusChip'
import { UsageSettingsSection } from '../usage/UsageSettingsSection'
import { getUsagePreferences, withUsageProviderEnabled, type UsageController } from '../../app/useIslandApp'
import type { UsageProvider } from '../../shared/lib/usageTypes'
import { AccentColorPicker } from './AccentColorPicker'
import { DirectConnectionDialog } from './DirectConnectionDialog'
import { useAppUpdater } from './useAppUpdater'
import { useWindowVisible } from './useWindowVisible'
import { useResetSettingsScrollOnChange } from './useResetSettingsScroll'
import type {
  AppConfig,
  AutostartSyncEvent,
  DirectYandexStatus,
  Locale,
  MediaSessionInfo,
  SmtcHealthSnapshot,
  TaskbarStatus,
} from '../../shared/lib/types'
import { createTranslator, directStatusMessage, normalizeLocale } from '../../shared/i18n/messages'
import { applyAccentTheme, normalizeHexColor } from '../../shared/lib/accentTheme'
import {
  getUiPrefs,
  getUsageWidgetCompact,
  getUsageWidgetScale,
  getSettingsColorScheme,
  shouldShowSettingsUpdateBanner,
  trackUpdateFirstSeen,
  withUiPrefs,
} from '../../shared/lib/uiPrefs'
import { GitHubBrandIcon, TelegramBrandIcon } from '../../shared/ui/BrandIcons'
import { GlassSurface } from '../../shared/ui/GlassSurface'
import { RangeSlider } from '../../shared/ui/RangeSlider'
import { StatusChip } from '../../shared/ui/StatusChip'
import { UpdateBanner } from '../../shared/ui/UpdateBanner'
import './settings.css'
export { IslandPreview as AppearancePreview } from './IslandPreview'

const APP_VERSION = '2.0.0'

interface SettingsPanelProps {
  usage?: UsageController
  config: AppConfig
  smtcHealth: SmtcHealthSnapshot
  mediaSessions: MediaSessionInfo[]
  onChange: (config: AppConfig) => void
  onCopyDiagnostics: () => void
  onRefreshSources: () => void
  autostartError?: string | null
  autostartStatus?: AutostartSyncEvent | null
}

export function SettingsPanel({
  usage,
  config,
  smtcHealth,
  mediaSessions,
  onChange,
  onCopyDiagnostics,
  onRefreshSources,
  autostartError = null,
  autostartStatus = null,
}: SettingsPanelProps) {
  const [draft, setDraft] = useState(config)
  const selectionId = useId()
  const prefersReducedMotion = useReducedMotion()
  const reducedMotion = Boolean(draft.appearance.reducedMotion || prefersReducedMotion)
  const uiPrefs = getUiPrefs(draft)
  const settingsColorScheme = getSettingsColorScheme(draft)
  const usageCompact = getUsageWidgetCompact(draft)
  const usageScale = getUsageWidgetScale(draft)
  const updater = useAppUpdater(true, Boolean(uiPrefs.forceSameVersionUpdate))
  const [showConsent, setShowConsent] = useState(false)
  const [directStatus, setDirectStatus] = useState<DirectYandexStatus>({
    state: 'disabled',
    message: 'Windows SMTC is active',
    port: null,
    executablePath: null,
  })
  const [directBusy, setDirectBusy] = useState(false)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  const saveTimer = useRef<number | null>(null)
  const connectAttempt = useRef(0)
  const lastSourceRefreshAt = useRef(0)
  const consentRef = useRef<HTMLElement>(null)

  const locale = normalizeLocale(draft.appearance.locale)
  const t = useMemo(() => createTranslator(locale), [locale])
  const [settingsScope, setSettingsScope] = useState<'island' | 'voice'>('island')
  const [settingsPage, setSettingsPage] = useState<'appearance' | 'taskbar' | 'source' | 'usage' | 'system' | 'about'>('appearance')
  useResetSettingsScrollOnChange(`${settingsScope}:${settingsPage}`, panelRef)
  const [usageError, setUsageError] = useState(false)
  const [voiceMounted, setVoiceMounted] = useState(false)
  const settingsVisible = useWindowVisible()
  const [taskbarStatus, setTaskbarStatus] = useState<TaskbarStatus>({ state: 'off' })
  const isSpotifySource = (id: string | null | undefined) => Boolean(id && (/^spotify(?:\.exe)?$/i.test(id) || /^SpotifyAB\.SpotifyMusic_[^!]+!Spotify$/i.test(id)))
  const spotifySession = mediaSessions.find((session) => isSpotifySource(session.sourceAppId))
  const spotifySelected = draft.media.protocol === 'smtc' && isSpotifySource(draft.media.preferredSourceAppId)
  const windowsSelected = draft.media.protocol === 'smtc' && !spotifySelected
  const spotifyUnavailable = spotifySelected && smtcHealth.status === 'unavailable'
  const latestVersion = updater.result?.latestVersion ?? null
  const updaterBusy =
    updater.status === 'downloading' || updater.status === 'installing'
  // Network/check errors stay in the About update field — not the top “update available” banner.
  const showSettingsUpdateBanner =
    updaterBusy
    || shouldShowSettingsUpdateBanner({
      hasUpdate: Boolean(updater.result?.hasUpdate) || uiPrefs.forceSettingsUpdateBanner === true,
      latestVersion: latestVersion ?? (uiPrefs.forceSettingsUpdateBanner ? 'dev' : null),
      prefs: uiPrefs,
    })
  const voiceActive = settingsVisible && settingsScope === 'voice'

  useEffect(() => setDraft(config), [config])

  useEffect(() => {
    if (!settingsVisible || settingsScope !== 'island' || settingsPage !== 'source' || !spotifySelected) return
    // The picker remains fresh if Spotify is opened while Settings is visible.
    // No extra session enumeration for other pages or hidden windows.
    const timer = window.setInterval(onRefreshSources, 3_000)
    return () => window.clearInterval(timer)
  }, [settingsVisible, settingsScope, settingsPage, spotifySelected, onRefreshSources])

  useEffect(() => {
    if (!settingsVisible || !draft.taskbar?.enabled) return
    let active = true
    let cleanup = () => {}
    void onTaskbarStatus((status) => { if (active) setTaskbarStatus(status) }).then((unlisten) => {
      if (!active) { unlisten(); return }
      cleanup = unlisten
      void getTaskbarStatus().then((status) => { if (active) setTaskbarStatus(status) })
        .catch(() => { if (active) setTaskbarStatus({ state: 'error' }) })
    }).catch(() => { if (active) setTaskbarStatus({ state: 'error' }) })
    return () => { active = false; cleanup() }
  }, [settingsVisible, draft.taskbar?.enabled])
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    const root = panelRef.current?.closest('.settings-window-root')
    if (!(root instanceof HTMLElement)) return
    root.dataset.colorScheme = settingsColorScheme
  }, [settingsColorScheme])

  useEffect(() => {
    applyAccentTheme(draft.appearance.accentColor)
    const root = document.querySelector('.settings-window-root')
    if (root instanceof HTMLElement) {
      applyAccentTheme(draft.appearance.accentColor, root)
    }
  }, [draft.appearance.accentColor])
  useEffect(() => {
    let active = true
    let cleanup: () => void = () => undefined
    void getDirectYandexStatus().then((status) => {
      if (active) setDirectStatus((current) => directStatusEqual(current, status) ? current : status)
    })
    void onDirectYandexStatus((status) => {
      if (active) setDirectStatus((current) => directStatusEqual(current, status) ? current : status)
    }).then((unlisten) => {
      if (active) cleanup = unlisten
      else unlisten()
    })
    if (config.media.protocol === 'smtc') onRefreshSources()
    return () => {
      active = false
      cleanup()
    }
  }, [config.media.protocol, onRefreshSources])

  const refreshSources = () => {
    const now = Date.now()
    if (draft.media.protocol !== 'smtc' || now - lastSourceRefreshAt.current < 1_000) return
    lastSourceRefreshAt.current = now
    onRefreshSources()
  }

  const previewAndSave = (next: AppConfig) => {
    setDraft(next)
    void previewConfig(next)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => onChange(next), 280)
  }

  const changeUsageConnection = async (provider: UsageProvider, enabled: boolean) => {
    if (!usage) return
    setUsageError(false)
    // Persist explicit consent before connecting. Native configuration owns the
    // shared polling lifecycle, so another window cannot revert this preference.
    const next = withUsageProviderEnabled(draft, provider, enabled)
    setDraft(next)
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    try {
      await onChange(next)
      if (enabled) await usage.connect(provider)
      else await usage.disconnect(provider)
    } catch {
      setUsageError(true)
    }
  }

  useEffect(() => {
    if (!updater.result?.hasUpdate || !updater.result.latestVersion) return
    const patch = trackUpdateFirstSeen(getUiPrefs(draft), updater.result.latestVersion)
    if (!patch) return
    previewAndSave(withUiPrefs(draft, patch))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- track first-seen once per version
  }, [updater.result?.hasUpdate, updater.result?.latestVersion])

  const patchBehavior = (behavior: Partial<AppConfig['behavior']>) =>
    previewAndSave({ ...draft, behavior: { ...draft.behavior, ...behavior } })
  const patchMedia = (media: Partial<AppConfig['media']>) =>
    previewAndSave({ ...draft, media: { ...draft.media, ...media } })
  const patchAppearance = (appearance: Partial<AppConfig['appearance']>) =>
    previewAndSave({ ...draft, appearance: { ...draft.appearance, ...appearance } })

  const setLocale = (next: Locale) => {
    if (normalizeLocale(draft.appearance.locale) === next) return
    patchAppearance({ locale: next })
  }

  const resetIslandSettings = () => {
    const defaults = getDefaultConfig()
    previewAndSave(withIslandLayout({
      ...draft,
      layout: {
        ...draft.layout,
        width: defaults.layout.width,
        scale: defaults.layout.scale,
        size: defaults.layout.size,
      },
      behavior: {
        ...draft.behavior,
        hoverDelayMs: defaults.behavior.hoverDelayMs,
      },
      appearance: { ...draft.appearance, accentColor: defaults.appearance.accentColor },
    }, getLegacyIslandLayout(defaults)))
  }

  const connectDirect = async () => {
    const attempt = ++connectAttempt.current
    setDirectBusy(true)
    try {
      const status = await enableDirectYandex()
      if (connectAttempt.current !== attempt) return
      setDirectStatus(status)
      patchMedia({
        protocol: 'yandex-direct',
        directYandexConsent: true,
        directYandexPort: status.port,
      })
      setShowConsent(false)
    } catch (error) {
      setDirectStatus({
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
        port: null,
        executablePath: null,
      })
    } finally {
      if (connectAttempt.current === attempt) setDirectBusy(false)
    }
  }

  const dismissConsent = () => {
    connectAttempt.current += 1
    setDirectBusy(false)
    setShowConsent(false)
  }

  useEffect(() => {
    if (!showConsent) return
    const previousFocus = document.activeElement
    const dialog = consentRef.current
    dialog?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        connectAttempt.current += 1
        setDirectBusy(false)
        setShowConsent(false)
      }
      if (event.key !== 'Tab' || !dialog) return
      const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
      const first = buttons[0]
      const last = buttons.at(-1)
      if (!buttons.some((button) => button === document.activeElement)) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target?.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [showConsent])

  const switchToLegacy = async (preferredSourceAppId: string | null = null) => {
    setDirectBusy(true)
    setSourceError(null)
    try {
      if (draft.media.protocol !== 'smtc') setDirectStatus(await disableDirectYandex(true))
      patchMedia({ protocol: 'smtc', directYandexPort: null, preferredSourceAppId })
      if (preferredSourceAppId === 'spotify' && !spotifySession) await openSpotify()
    } catch {
      setSourceError(locale === 'ru' ? preferredSourceAppId === 'spotify' ? 'Не удалось открыть Spotify. Проверьте, что приложение установлено.' : 'Не удалось сменить источник. Попробуйте ещё раз.' : preferredSourceAppId === 'spotify' ? 'Could not open Spotify. Check that the app is installed.' : 'Could not switch source. Try again.')
    } finally {
      setDirectBusy(false)
    }
  }

  const restartDirect = async () => {
    const attempt = ++connectAttempt.current
    setDirectBusy(true)
    try {
      const status = await enableDirectYandex()
      if (connectAttempt.current !== attempt) return
      setDirectStatus(status)
      patchMedia({
        protocol: 'yandex-direct',
        directYandexConsent: true,
        directYandexPort: status.port,
      })
    } catch (error) {
      if (connectAttempt.current !== attempt) return
      setDirectStatus({
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
        port: draft.media.directYandexPort,
        executablePath: null,
      })
    } finally {
      if (connectAttempt.current === attempt) setDirectBusy(false)
    }
  }

  const directActive = draft.media.protocol === 'yandex-direct'
  const directNeedsRecovery = directActive && (
    directStatus.state === 'degraded'
    || directStatus.state === 'restart-required'
    || directStatus.state === 'error'
    || directStatus.state === 'incompatible'
  )
  const directConnected = directActive && (
    directStatus.state === 'connected' || directStatus.state === 'degraded'
  )
  const directMessage = directStatusMessage(directStatus.state, directStatus.message, t)

  return (
    <section ref={panelRef} className="settings-panel" aria-label={t('settings.title')} data-color-scheme={settingsColorScheme} data-reduced-motion={reducedMotion || undefined}>
      <header className="settings-hero">
        <div className="settings-scope-switch" role="group" aria-label={t('settings.scope')}>
          <button
            type="button"
            aria-pressed={settingsScope === 'island'}
            className={`settings-scope-switch__btn ${settingsScope === 'island' ? 'settings-scope-switch__btn--active' : ''}`}
            onClick={() => setSettingsScope('island')}
          >
            {settingsScope === 'island' ? <SelectionMarker id={`${selectionId}-scope`} reducedMotion={reducedMotion} /> : null}
            <span className="settings-selection-label">{t('settings.scopeIsland')}</span>
          </button>
          <button
            type="button"
            aria-pressed={settingsScope === 'voice'}
            className={`settings-scope-switch__btn settings-scope-switch__btn--voice ${settingsScope === 'voice' ? 'settings-scope-switch__btn--active' : ''}`}
            onClick={() => {
              setVoiceMounted(true)
              setSettingsScope('voice')
            }}
          >
            {settingsScope === 'voice' ? <SelectionMarker id={`${selectionId}-scope`} reducedMotion={reducedMotion} /> : null}
            <span className="settings-scope-switch__label">{t('settings.scopeVoice')}</span>
            <span className="settings-scope-badge">{t('settings.scopeVoiceBeta')}</span>
          </button>
        </div>
        <div className="settings-hero-tools">
        <button type="button" className="settings-theme-toggle"
          aria-label={locale === 'ru' ? settingsColorScheme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему' : settingsColorScheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title={t('settings.colorScheme')}
          onClick={() => previewAndSave(withUiPrefs(draft, { settingsColorScheme: settingsColorScheme === 'dark' ? 'light' : 'dark' }))}>
          <motion.span key={settingsColorScheme} initial={reducedMotion ? false : { rotate: -40, opacity: 0, scale: .6 }} animate={{ rotate: 0, opacity: 1, scale: 1 }} transition={{ duration: .2 }}>
            {settingsColorScheme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
          </motion.span>
        </button>
        <div className="locale-switch" role="group" aria-label="Language">
          <button
            type="button"
            className={`locale-switch__btn ${locale === 'ru' ? 'locale-switch__btn--active' : ''}`}
            aria-pressed={locale === 'ru'}
            onClick={() => setLocale('ru')}
          >
            {locale === 'ru' ? <SelectionMarker id={`${selectionId}-locale`} reducedMotion={reducedMotion} /> : null}
            <span className="settings-selection-label">Ru</span>
          </button>
          <button
            type="button"
            className={`locale-switch__btn ${locale === 'en' ? 'locale-switch__btn--active' : ''}`}
            aria-pressed={locale === 'en'}
            onClick={() => setLocale('en')}
          >
            {locale === 'en' ? <SelectionMarker id={`${selectionId}-locale`} reducedMotion={reducedMotion} /> : null}
            <span className="settings-selection-label">En</span>
          </button>
        </div>
        </div>
      </header>

      {voiceMounted ? (
        <div className="settings-scope-content" hidden={settingsScope !== 'voice'} aria-hidden={settingsScope !== 'voice'}>
          <VoiceSettingsView
            locale={locale}
            reducedMotion={reducedMotion}
            active={voiceActive}
            developerMode={Boolean(uiPrefs.developerMode)}
            showExperimentalBanner={
              Boolean(uiPrefs.forceVoiceExperimentalBanner)
              || !uiPrefs.dismissedVoiceExperimentalBanner
            }
            onDismissExperimentalBanner={() =>
              previewAndSave(
                withUiPrefs(draft, {
                  dismissedVoiceExperimentalBanner: true,
                  forceVoiceExperimentalBanner: false,
                }),
              )
            }
          />
        </div>
      ) : null}

      {settingsScope === 'island' ? (
      <>
      <div className="settings-layout">
      <nav className="settings-navigation" aria-label={t('settings.navigation')}>
        {([
          ['appearance', 'settings.appearance', SlidersHorizontal],
          ['taskbar', 'settings.taskbar', PanelBottom],
          ['source', 'settings.source', RadioTower],
          ['usage', 'settings.usage', SquareTerminal],
          ['system', 'settings.system', Power],
          ['about', 'settings.about', Info],
        ] as const).map(([page, label, Icon]) => (
          <button key={page} type="button" aria-current={settingsPage === page ? 'page' : undefined}
            className={`settings-nav-item ${settingsPage === page ? 'settings-nav-item--active' : ''}`}
            onClick={() => setSettingsPage(page)}>
            {settingsPage === page ? <SelectionMarker id={`${selectionId}-navigation`} reducedMotion={reducedMotion} /> : null}
            <Icon size={17} aria-hidden="true" /><span className="settings-selection-label">{t(label)}</span>
          </button>
        ))}
        <span className="settings-navigation-version">Music Island <span>{APP_VERSION}</span></span>
      </nav>
      <div className="settings-content">
      <h2 className="settings-page-heading">{t(({
        appearance: 'settings.appearance', taskbar: 'settings.taskbar', source: 'settings.source',
        usage: 'settings.usage', system: 'settings.system', about: 'settings.about',
      } as const)[settingsPage])}</h2>
      {showSettingsUpdateBanner ? (
        <UpdateBanner
          variant="settings"
          title={
            latestVersion
              ? `${t('settings.updateBannerTitleVersion')} ${latestVersion}`
              : t('settings.updateBannerTitle')
          }
          releaseNotes={updater.result?.releaseNotes}
          emptyNotesLabel={t('settings.updateNotesEmpty')}
          expandLabel={t('settings.updateNotesExpand')}
          collapseLabel={t('settings.updateNotesCollapse')}
          primaryLabel={t(updater.status === 'error' ? 'settings.updateRetry' : 'settings.updateNow')}
          laterLabel={t('settings.updateLater')}
          status={
            updater.status === 'downloading' || updater.status === 'installing' || updater.status === 'error'
              ? updater.status
              : 'available'
          }
          progressPercent={updater.progress?.percent ?? null}
          progressLabel={
            updater.status === 'downloading'
              ? t('settings.downloadingUpdate')
              : updater.status === 'installing'
                ? t('settings.installingUpdate')
                : undefined
          }
          error={updater.error}
          onPrimary={() => void updater.install()}
          onLater={() =>
            previewAndSave(
              withUiPrefs(draft, {
                dismissedUpdateVersion: latestVersion ?? 'dev',
                forceSettingsUpdateBanner: false,
              }),
            )
          }
          onOpenUrl={(url) => void openExternalUrl(url)}
        />
      ) : null}

      <SettingsSection
        hidden={settingsPage !== 'appearance'}
        title={t('settings.appearance')}
        icon={<Music2 />}
        showTitle={false}
        className="settings-appearance"
      >
        <IslandLayoutEditor config={draft} onChange={previewAndSave} onReset={resetIslandSettings} usage={usage?.snapshot ?? null} showHeading={false} active={settingsVisible && settingsPage === 'appearance'} />

        <AccentColorPicker
          value={draft.appearance.accentColor}
          label={t('settings.accentColor')}
          customLabel={t('settings.accentCustom')}
          onChange={(hex) => patchAppearance({ accentColor: normalizeHexColor(hex) })}
        />

        <label className="settings-control-row">
          <span>
            <strong>{t('settings.hoverDelay')}</strong>
            <small>{t('settings.hoverDelayHint')}</small>
          </span>
          <div className="range-control">
            <RangeSlider min={80} max={1200} step={20} value={draft.behavior.hoverDelayMs} onChange={(event) => patchBehavior({ hoverDelayMs: Number(event.currentTarget.value) })} />
            <output>{draft.behavior.hoverDelayMs} {t('settings.milliseconds')}</output>
          </div>
        </label>
      </SettingsSection>

      {settingsPage === 'usage' ? (
        <div className="settings-usage-page">
          <SettingsSection title={locale === 'ru' ? 'Виджет лимитов' : 'Usage widget'} icon={<SquareTerminal />}>
            <div className="usage-widget-preview" aria-label={locale === 'ru' ? 'Превью виджета лимитов' : 'Usage widget preview'}>
              {settingsVisible ? <WarpMaterial className="preview-warp-material" reducedMotion={draft.appearance.reducedMotion} /> : null}
              <div className="usage-widget-preview__content" style={{ zoom: usageScale }}><UsageStatusChip snapshot={usage?.snapshot ?? null} enabledProviders={['codex', 'claude']} compact={usageCompact} locale={locale} /></div>
            </div>
            <div className="settings-control-row settings-control-row--after-preview">
              <span><strong>{locale === 'ru' ? 'Вид' : 'Style'}</strong></span>
              <div className="settings-theme-choice" role="group" aria-label={locale === 'ru' ? 'Вид виджета' : 'Widget style'}>
                {[false, true].map((compact) => <button key={String(compact)} type="button" aria-pressed={usageCompact === compact} className={`settings-theme-choice__button ${usageCompact === compact ? 'settings-theme-choice__button--active' : ''}`} onClick={() => previewAndSave(withUiPrefs(draft, { usageWidgetCompact: compact }))}>{locale === 'ru' ? compact ? 'Компактный' : 'Подробный' : compact ? 'Compact' : 'Detailed'}</button>)}
              </div>
            </div>
            <label className="settings-control-row"><span><strong>{locale === 'ru' ? 'Масштаб виджета' : 'Widget scale'}</strong></span><div className="range-control">
              <RangeSlider min={65} max={135} step={5} value={Math.round(usageScale * 100)} onChange={(event) => previewAndSave(withUiPrefs(draft, { usageWidgetScale: Number(event.currentTarget.value) / 100 }))} />
              <output>{Math.round(usageScale * 100)}%</output>
            </div></label>
            <Switch label={locale === 'ru' ? 'Показывать при закрытом островке' : 'Show while the island is closed'} checked={uiPrefs.usageAlwaysVisible === true} onChange={(usageAlwaysVisible) => previewAndSave(withUiPrefs(draft, { usageAlwaysVisible }))} />
          </SettingsSection>
          <UsageSettingsSection
            preferences={getUsagePreferences(draft)} snapshot={usage?.snapshot ?? null}
            busyProvider={usage?.busyProvider ?? null} locale={locale}
            onConnect={(provider) => void changeUsageConnection(provider, true)}
            onDisconnect={(provider) => void changeUsageConnection(provider, false)}
            onRefresh={(provider) => { setUsageError(false); void usage?.refresh(provider).catch(() => setUsageError(true)) }}
          />
          {usageError ? <p role="alert" className="settings-taskbar-note">{t('settings.usageError')}</p> : null}
        </div>
      ) : null}

      <SettingsSection className="settings-taskbar" hidden={settingsPage !== 'taskbar'} title={t('settings.taskbar')} icon={<PanelBottom />} showTitle={false}>
        <div className="settings-feature-control" data-enabled={Boolean(draft.taskbar?.enabled)}>
          <span className="settings-feature-control__icon" aria-hidden="true"><PanelBottom size={23} strokeWidth={1.6} /></span>
          <Switch
            label={t('settings.taskbarEnabled')}
            hint={locale === 'ru' ? 'Управление музыкой рядом с треем Windows' : 'Music controls beside the Windows system tray'}
            checked={Boolean(draft.taskbar?.enabled)}
            onChange={(enabled) => previewAndSave({ ...draft, taskbar: { ...draft.taskbar, enabled } })}
          />
        </div>
        <TaskbarLayoutEditor config={draft} onChange={previewAndSave} active={settingsVisible && settingsPage === 'taskbar'} />
        <label className="settings-control-row">
          <span><strong>{locale === 'ru' ? 'Размер кнопок' : 'Button size'}</strong></span>
          <div className="range-control">
            <RangeSlider min={75} max={125} step={5} value={Math.round((draft.taskbar?.scale ?? 1) * 100)} onChange={(event) => previewAndSave({ ...draft, taskbar: { ...draft.taskbar, enabled: Boolean(draft.taskbar?.enabled), scale: Number(event.currentTarget.value) / 100 } })} />
            <output>{Math.round((draft.taskbar?.scale ?? 1) * 100)}%</output>
          </div>
        </label>
        {draft.taskbar?.enabled && ['no-space', 'unsupported', 'error'].includes(taskbarStatus.state) ? (
          <p className="settings-taskbar-note" role="status">
            {t(taskbarStatus.state === 'no-space' ? 'settings.taskbarNoSpace'
              : taskbarStatus.state === 'unsupported' ? 'settings.taskbarUnsupported'
              : 'settings.taskbarError')}
          </p>
        ) : null}
      </SettingsSection>

      <SettingsSection hidden={settingsPage !== 'source'} title={t('settings.source')} icon={<Activity />} showTitle={false}>
        <div className="protocol-list">
          <article className={`protocol-row ${windowsSelected ? 'protocol-row--selected' : ''}`}>
            <span className="protocol-icon"><BrandLogo brand="windows" size={30} /></span>
            <div className="protocol-copy">
              <div className="protocol-heading">
              <strong>Windows</strong>
              <StatusChip
                tone={windowsSelected ? smtcHealth.status === 'healthy' ? 'success' : 'warning' : 'neutral'}
                className={`status-pill ${windowsSelected ? `status-pill--${smtcHealth.status}` : ''}`}
              >
                {windowsSelected && (smtcHealth.status === 'healthy' ? <CheckCircle2 /> : <TriangleAlert />)}
                {windowsSelected ? t(smtcHealth.status === 'healthy' ? 'settings.active' : 'settings.needsAttention') : null}
              </StatusChip>
              </div>
              <small>{t('settings.smtcHint')}</small>
              {uiPrefs.developerMode ? <small>{smtcHealth.lastProbeMs} ms · {smtcHealth.sessionCount} {t('settings.sessions')}</small> : null}
            </div>
            {!windowsSelected ? (
              <button type="button" className="secondary-button" disabled={directBusy} onClick={() => void switchToLegacy()}>{t('settings.use')}</button>
            ) : null}
          </article>

          <article className={`protocol-row ${spotifySelected ? 'protocol-row--selected' : ''} ${spotifyUnavailable ? 'protocol-row--unavailable' : ''}`}>
            <span className="protocol-icon"><BrandLogo brand="spotify" size={32} /></span>
            <div className="protocol-copy">
              <div className="protocol-heading"><strong>Spotify</strong>{spotifySelected ? <StatusChip tone={spotifyUnavailable ? 'warning' : spotifySession ? 'success' : 'neutral'} className="status-pill">{spotifyUnavailable ? <TriangleAlert /> : spotifySession ? <CheckCircle2 /> : null}{spotifyUnavailable ? t('settings.needsAttention') : spotifySession ? t('settings.connected') : locale === 'ru' ? 'Ожидание' : 'Waiting'}</StatusChip> : null}</div>
              <small>{spotifyUnavailable ? locale === 'ru' ? 'Системное управление музыкой Windows недоступно.' : 'Windows media controls are unavailable.' : spotifySelected && !spotifySession ? locale === 'ru' ? 'Включите любой трек в приложении Spotify.' : 'Play a track in the Spotify app.' : locale === 'ru' ? 'Музыка из приложения Spotify' : 'Music from the Spotify app'}</small>
            </div>
            <div className="protocol-actions">
              {!spotifySelected ? <button type="button" className="secondary-button" disabled={directBusy} onClick={() => void switchToLegacy('spotify')}>{t('settings.use')}</button>
                : <button type="button" className="secondary-button" onClick={() => { setSourceError(null); void openSpotify().catch(() => setSourceError(locale === 'ru' ? 'Не удалось открыть Spotify. Проверьте, что приложение установлено.' : 'Could not open Spotify. Check that the app is installed.')) }}>{locale === 'ru' ? 'Открыть Spotify' : 'Open Spotify'}</button>}
            </div>
          </article>

          <article className={`protocol-row ${draft.media.protocol === 'yandex-direct' ? 'protocol-row--selected' : ''}`}>
            <span className="protocol-icon protocol-icon--yandex"><BrandLogo brand="yandex-music" size={32} /></span>
            <div className="protocol-copy">
              <div className="protocol-heading">
              <strong>{locale === 'ru' ? 'Яндекс Музыка' : 'Yandex Music'}</strong>
              <StatusChip
                tone={directStatus.state === 'connected' ? 'success' : directStatus.state === 'degraded' ? 'warning' : 'neutral'}
                className={`status-pill status-pill--${directStatus.state}`}
              >
                {directStatus.state === 'connected' ? <CheckCircle2 /> : <Activity />}
                {t(directStatus.state === 'connected' ? 'settings.connected' : directStatus.state === 'disabled' ? 'settings.optional' : directStatus.state === 'connecting' ? 'consent.connecting' : 'settings.needsAttention')}
              </StatusChip>
              </div>
              <small>{directStatus.state === 'disabled' || directStatus.state === 'connected' ? t('settings.directHint') : directMessage}</small>
              {uiPrefs.developerMode && directStatus.port ? <small>127.0.0.1:{directStatus.port}</small> : null}
            </div>
            <div className="protocol-actions">
              {directConnected || directNeedsRecovery ? (
                <>
                  {directNeedsRecovery ? (
                    <button type="button" className="primary-button" disabled={directBusy} onClick={() => void restartDirect()}>
                      {directBusy ? t('settings.restarting') : t('settings.restart')}
                    </button>
                  ) : null}
                  <button type="button" className="secondary-button" disabled={directBusy} onClick={() => void switchToLegacy()}>{t('settings.disconnect')}</button>
                </>
              ) : (
                <button type="button" className="primary-button" disabled={directBusy} onClick={() => setShowConsent(true)}>{t('settings.connect')}</button>
              )}
            </div>
          </article>
        </div>
        {windowsSelected ? <label className="settings-control-row settings-source-picker">
          <span><strong>{t('settings.preferredSource')}</strong></span>
          <select value={draft.media.preferredSourceAppId ?? ''} onFocus={refreshSources} onChange={(event) => { setSourceError(null); patchMedia({ preferredSourceAppId: event.currentTarget.value || null }) }}>
            <option value="">{t('settings.sourceAuto')}</option>
            {draft.media.preferredSourceAppId && !mediaSessions.some((session) => session.sourceAppId === draft.media.preferredSourceAppId) ? <option value={draft.media.preferredSourceAppId}>{draft.media.preferredSourceAppId}</option> : null}
            {mediaSessions.map((session) => <option key={session.sourceAppId} value={session.sourceAppId}>{isSpotifySource(session.sourceAppId) ? 'Spotify' : session.sourceAppId}</option>)}
          </select>
        </label> : null}
        {sourceError ? <p className="settings-taskbar-note" role="alert">{sourceError}</p> : null}
      </SettingsSection>

      <SettingsSection hidden={settingsPage !== 'system'} title={t('settings.system')} icon={<Power />} showTitle={false}>
        <div className="autostart-block">
          <Switch
            label={t('settings.launchAtStartup')}
            hint={t('settings.launchAtStartupHint')}
            checked={draft.behavior.launchAtStartup}
            onChange={(launchAtStartup) => patchBehavior({ launchAtStartup })}
          />
          {autostartError ? (
            <p className="autostart-feedback autostart-feedback--error">{autostartError}</p>
          ) : null}
          {!autostartError && autostartStatus && !autostartStatus.ok ? (
            <p className="autostart-feedback autostart-feedback--error">
              {autostartStatus.message ?? t('settings.autostartFail')}
            </p>
          ) : null}
          {!autostartError && autostartStatus?.ok && draft.behavior.launchAtStartup && autostartStatus.exePath ? (
            <p className="autostart-feedback" title={autostartStatus.command ?? autostartStatus.exePath}>
              <span className="autostart-feedback__state">{t('settings.autostartOk')}</span>
              <span className="autostart-feedback__path">{autostartStatus.exePath}</span>
            </p>
          ) : null}
        </div>
      </SettingsSection>

      <SettingsSection hidden={settingsPage !== 'about'} title={t('settings.about')} icon={<Info />} showTitle={false}>
        <div className="about-block">
          <div className="about-identity">
            <div className="about-identity__island" aria-hidden="true"><Music2 size={18} /><span className="about-identity__wave"><i /><i /><i /><i /><i /></span><Pause size={15} /></div>
            <h3>Music Island</h3><span className="about-identity__version">{APP_VERSION}</span>
            <p>{locale === 'ru' ? 'Музыка всегда рядом.' : 'Your music, within reach.'}</p>
          </div>
          <p className="about-block__body">
            {t('settings.aboutBody')}{' '}
            <button
              type="button"
              className="about-inline-link"
              onClick={() =>
                void openExternalUrl('https://github.com/redheadesign/music-island/blob/master/LICENSE')
              }
            >
              {t('settings.aboutGplLink')}
            </button>
            {t('settings.aboutBodyAfterLicense')}
          </p>

          <div className="about-update about-update--elevated">
            <strong className="about-update__version">{locale === 'ru' ? 'Обновления' : 'Updates'}</strong>
            <div className="about-update-row">
              <span
                className={`about-update-status about-update-status--${
                  updater.error && updater.status === 'idle' ? 'error' : updater.status
                }`}
              >
                {updater.status === 'checking'
                  ? t('settings.checkingUpdates')
                  : updater.status === 'upToDate'
                    ? t('settings.upToDate')
                    : updater.status === 'available'
                      ? `${t('settings.updateAvailable')}${
                          updater.result?.latestVersion ? ` · v${updater.result.latestVersion}` : ''
                        }`
                      : updater.status === 'downloading'
                        ? t('settings.downloadingUpdate')
                        : updater.status === 'installing'
                          ? t('settings.installingUpdate')
                          : updater.status === 'error' || updater.error
                            ? t('settings.updateError')
                            : t('settings.updateDescription')}
              </span>
              {updater.status === 'available' ? (
                <button
                  type="button"
                  className="about-link about-link--accent"
                  onClick={() => void updater.install()}
                >
                  {t('settings.downloadUpdate')}
                </button>
              ) : (
                <button
                  type="button"
                  className="about-link"
                  disabled={
                    updater.status === 'checking'
                    || updater.status === 'downloading'
                    || updater.status === 'installing'
                  }
                  onClick={() => void updater.check(true)}
                >
                  {t('settings.checkForUpdates')}
                </button>
              )}
            </div>
            {(updater.status === 'downloading' || updater.status === 'installing') && (
              <div
                className="about-update-progress"
                role="progressbar"
                aria-label={t('settings.updateProgress')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={updater.progress?.percent ?? 0}
              >
                <div className="about-update-progress__track">
                  <div
                    className="about-update-progress__fill"
                    style={{
                      width: `${updater.progress?.percent ?? (updater.status === 'installing' ? 100 : 0)}%`,
                    }}
                  />
                </div>
                <small>
                  {t('settings.updateProgress')}
                  {updater.progress?.percent != null ? ` · ${updater.progress.percent}%` : ''}
                  {updater.progress?.message ? ` — ${updater.progress.message}` : ''}
                </small>
              </div>
            )}
            {updater.error ? <p className="about-update-error">{updater.error}</p> : null}
          </div>

          <div className="about-links">
            <button
              type="button"
              className="about-social about-social--telegram"
              onClick={() => void openExternalUrl('https://t.me/redheadesigner')}
            >
              <TelegramBrandIcon size={20} />
              <span>Telegram</span>
            </button>
            <button
              type="button"
              className="about-social about-social--github"
              onClick={() => void openExternalUrl('https://github.com/redheadesign/music-island')}
            >
              <GitHubBrandIcon size={20} />
              <span>GitHub</span>
            </button>
          </div>
        </div>
      </SettingsSection>
      </div>
      </div>
      </>
      ) : null}

      {uiPrefs.developerMode ? (
        <SettingsSection title={t('settings.devPreview')} icon={<Wrench />}>
          <div className="settings-dev-panel">
            <Switch
              label={t('settings.devForceSettingsUpdate')}
              checked={Boolean(uiPrefs.forceSettingsUpdateBanner)}
              onChange={(checked) =>
                previewAndSave(withUiPrefs(draft, { forceSettingsUpdateBanner: checked }))
              }
            />
            <Switch
              label={t('settings.devForceIslandUpdate')}
              checked={Boolean(uiPrefs.forceIslandUpdateBanner)}
              onChange={(checked) =>
                previewAndSave(withUiPrefs(draft, { forceIslandUpdateBanner: checked }))
              }
            />
            <Switch
              label={t('settings.devForceVoiceBanner')}
              checked={Boolean(uiPrefs.forceVoiceExperimentalBanner)}
              onChange={(checked) =>
                previewAndSave(
                  withUiPrefs(draft, {
                    forceVoiceExperimentalBanner: checked,
                    ...(checked ? { dismissedVoiceExperimentalBanner: false } : {}),
                  }),
                )
              }
            />
            <Switch
              label={t('settings.devForceSameVersionUpdate')}
              checked={Boolean(uiPrefs.forceSameVersionUpdate)}
              onChange={(checked) =>
                previewAndSave(withUiPrefs(draft, { forceSameVersionUpdate: checked }))
              }
            />
            <button
              type="button"
              className="secondary-button settings-dev-replay"
              onClick={() => void replayIntroWindow()}
            >
              {t('settings.devReplayIntro')}
            </button>
          </div>
        </SettingsSection>
      ) : null}

      <footer className="settings-footer">
        <button type="button" className="settings-footer-action" onClick={onCopyDiagnostics}>
          <Copy />
          {t('settings.copyDiagnostics')}
        </button>
        <button
          type="button"
          className="settings-footer-action settings-footer-action--dev"
          onClick={() =>
            previewAndSave(
              withUiPrefs(draft, {
                developerMode: !uiPrefs.developerMode,
                ...(uiPrefs.developerMode
                  ? {
                      forceSettingsUpdateBanner: false,
                      forceIslandUpdateBanner: false,
                      forceVoiceExperimentalBanner: false,
                      forceSameVersionUpdate: false,
                    }
                  : {}),
              }),
            )
          }
        >
          <Wrench />
          {uiPrefs.developerMode ? t('settings.devModeOn') : t('settings.devMode')}
        </button>
      </footer>

      {showConsent ? createPortal((
        <div className="direct-connection-backdrop" role="presentation" data-color-scheme={settingsColorScheme} data-reduced-motion={reducedMotion || undefined}>
          <DirectConnectionDialog
            reducedMotion={reducedMotion}
            ref={consentRef}
            locale={locale}
            busy={directBusy}
            error={directStatus.state === 'error' ? directMessage : null}
            onCancel={dismissConsent}
            onConnect={() => void connectDirect()}
          />
        </div>
      ), document.body) : null}
    </section>
  )
}

function SelectionMarker({ id, reducedMotion }: { id: string; reducedMotion: boolean }) {
  return <motion.span className="settings-selection-marker" aria-hidden="true"
    layoutId={reducedMotion ? undefined : id}
    initial={false}
    transition={{ duration: reducedMotion ? 0 : .2, ease: [.2, 0, 0, 1] }} />
}

function directStatusEqual(left: DirectYandexStatus, right: DirectYandexStatus): boolean {
  return left.state === right.state
    && left.message === right.message
    && left.port === right.port
    && left.executablePath === right.executablePath
}

interface SettingsSectionProps {
  className?: string
  title: string
  icon: ReactNode
  children: ReactNode
  action?: ReactNode
  hidden?: boolean
  showTitle?: boolean
}

function SettingsSection({ title, icon, children, action, hidden, showTitle = true, className = '' }: SettingsSectionProps) {
  return (
    <GlassSurface as="section" className={`settings-section ${className}`.trim()} hidden={hidden} aria-label={title}>
      {showTitle ? <header className="settings-section-header">
        <div className="settings-section-title">
          {icon}
          <h2>{title}</h2>
        </div>
        {action}
      </header> : null}
      {children}
    </GlassSurface>
  )
}

interface SwitchProps {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function Switch({ label, hint, checked, onChange }: SwitchProps) {
  return (
    <div className="settings-switch-row">
      <span className="settings-switch-copy">
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      <button
        type="button"
        className={['ui-switch', checked ? 'ui-switch--on' : ''].filter(Boolean).join(' ')}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      >
        <span className="ui-switch__thumb" aria-hidden="true" />
      </button>
    </div>
  )
}
