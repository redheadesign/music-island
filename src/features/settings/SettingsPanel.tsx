import { Activity, CheckCircle2, Copy, Info, Music2, Power, RadioTower, RotateCcw, TriangleAlert, Wrench } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  disableDirectYandex,
  enableDirectYandex,
  getDirectYandexStatus,
  onDirectYandexStatus,
  previewConfig,
  getDefaultConfig,
  openExternalUrl,
  replayIntroWindow,
} from '../../app/tauriApi'
import { VoiceSettingsView } from '../plugins/voice/VoiceSettingsView'
import { AccentColorPicker } from './AccentColorPicker'
import { useAppUpdater } from './useAppUpdater'
import type {
  AppConfig,
  AutostartSyncEvent,
  DirectYandexStatus,
  Locale,
  MediaSessionInfo,
  SmtcHealthSnapshot,
} from '../../shared/lib/types'
import { createTranslator, directStatusMessage, normalizeLocale } from '../../shared/i18n/messages'
import { applyAccentTheme, normalizeHexColor } from '../../shared/lib/accentTheme'
import {
  getUiPrefs,
  shouldShowSettingsUpdateBanner,
  trackUpdateFirstSeen,
  withUiPrefs,
} from '../../shared/lib/uiPrefs'
import { GitHubBrandIcon, TelegramBrandIcon } from '../../shared/ui/BrandIcons'
import { GlassSurface } from '../../shared/ui/GlassSurface'
import { RangeSlider } from '../../shared/ui/RangeSlider'
import { StatusChip } from '../../shared/ui/StatusChip'
import { UpdateBanner } from '../../shared/ui/UpdateBanner'

const APP_VERSION = '1.3.1'

interface SettingsPanelProps {
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
  const uiPrefs = getUiPrefs(draft)
  const updater = useAppUpdater(true, Boolean(uiPrefs.forceSameVersionUpdate))
  const [showConsent, setShowConsent] = useState(false)
  const [directStatus, setDirectStatus] = useState<DirectYandexStatus>({
    state: 'disabled',
    message: 'Windows SMTC is active',
    port: null,
    executablePath: null,
  })
  const [directBusy, setDirectBusy] = useState(false)
  const saveTimer = useRef<number | null>(null)
  const connectAttempt = useRef(0)
  const lastSourceRefreshAt = useRef(0)

  const locale = normalizeLocale(draft.appearance.locale)
  const t = useMemo(() => createTranslator(locale), [locale])
  const [settingsScope, setSettingsScope] = useState<'island' | 'voice'>('island')
  const latestVersion = updater.result?.latestVersion ?? null
  const showSettingsUpdateBanner = shouldShowSettingsUpdateBanner({
    hasUpdate: Boolean(updater.result?.hasUpdate) || uiPrefs.forceSettingsUpdateBanner === true,
    latestVersion: latestVersion ?? (uiPrefs.forceSettingsUpdateBanner ? 'dev' : null),
    prefs: uiPrefs,
  })

  useEffect(() => setDraft(config), [config])
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

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

  useEffect(() => {
    if (!updater.result?.hasUpdate || !updater.result.latestVersion) return
    const patch = trackUpdateFirstSeen(getUiPrefs(draft), updater.result.latestVersion)
    if (!patch) return
    previewAndSave(withUiPrefs(draft, patch))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- track first-seen once per version
  }, [updater.result?.hasUpdate, updater.result?.latestVersion])

  const patchLayout = (layout: Partial<AppConfig['layout']>) =>
    previewAndSave({ ...draft, layout: { ...draft.layout, ...layout } })
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
    previewAndSave({
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
    })
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

  const switchToLegacy = async () => {
    setDirectBusy(true)
    try {
      setDirectStatus(await disableDirectYandex(true))
      patchMedia({ protocol: 'smtc', directYandexPort: null })
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
    <section className="settings-panel" aria-label={t('settings.title')}>
      <header className="settings-hero">
        <div className="settings-scope-switch" role="tablist" aria-label={t('settings.scope')}>
          <button
            type="button"
            role="tab"
            aria-selected={settingsScope === 'island'}
            className={`settings-scope-switch__btn ${settingsScope === 'island' ? 'settings-scope-switch__btn--active' : ''}`}
            onClick={() => setSettingsScope('island')}
          >
            {t('settings.scopeIsland')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={settingsScope === 'voice'}
            className={`settings-scope-switch__btn settings-scope-switch__btn--voice ${settingsScope === 'voice' ? 'settings-scope-switch__btn--active' : ''}`}
            onClick={() => setSettingsScope('voice')}
          >
            <span className="settings-scope-switch__label">{t('settings.scopeVoice')}</span>
            <span className="settings-scope-badge">{t('settings.scopeVoiceBeta')}</span>
          </button>
        </div>
        <div className="locale-switch" role="group" aria-label="Language">
          <button
            type="button"
            className={`locale-switch__btn ${locale === 'ru' ? 'locale-switch__btn--active' : ''}`}
            aria-pressed={locale === 'ru'}
            onClick={() => setLocale('ru')}
          >
            Ru
          </button>
          <button
            type="button"
            className={`locale-switch__btn ${locale === 'en' ? 'locale-switch__btn--active' : ''}`}
            aria-pressed={locale === 'en'}
            onClick={() => setLocale('en')}
          >
            En
          </button>
        </div>
      </header>

      {settingsScope === 'voice' ? (
        <VoiceSettingsView
          locale={locale}
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
      ) : null}

      {settingsScope === 'island' ? (
      <>
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
          primaryLabel={t('settings.updateNow')}
          laterLabel={t('settings.updateLater')}
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
        title={t('settings.island')}
        icon={<Music2 />}
        action={(
          <button type="button" className="settings-section-reset" onClick={resetIslandSettings}>
            <RotateCcw aria-hidden="true" />
            {t('settings.reset')}
          </button>
        )}
      >
        <AccentColorPicker
          value={draft.appearance.accentColor}
          label={t('settings.accentColor')}
          customLabel={t('settings.accentCustom')}
          onChange={(hex) => patchAppearance({ accentColor: normalizeHexColor(hex) })}
        />

        <label className="settings-control-row">
          <span>
            <strong>{t('settings.width')}</strong>
            <small>{t('settings.widthHint')}</small>
          </span>
          <div className="range-control">
            <RangeSlider min={80} max={125} value={draft.layout.width} onChange={(event) => patchLayout({ width: Number(event.currentTarget.value), size: 'medium' })} />
            <output>{draft.layout.width}%</output>
          </div>
        </label>

        <label className="settings-control-row">
          <span>
            <strong>{t('settings.scale')}</strong>
            <small>{t('settings.scaleHint')}</small>
          </span>
          <div className="range-control">
            <RangeSlider min={70} max={120} value={draft.layout.scale} onChange={(event) => patchLayout({ scale: Number(event.currentTarget.value) })} />
            <output>{draft.layout.scale}%</output>
          </div>
        </label>

        <label className="settings-control-row">
          <span>
            <strong>{t('settings.hoverDelay')}</strong>
            <small>{t('settings.hoverDelayHint')}</small>
          </span>
          <div className="range-control">
            <RangeSlider min={80} max={1200} step={20} value={draft.behavior.hoverDelayMs} onChange={(event) => patchBehavior({ hoverDelayMs: Number(event.currentTarget.value) })} />
            <output>{draft.behavior.hoverDelayMs} ms</output>
          </div>
        </label>
      </SettingsSection>

      <SettingsSection title={t('settings.source')} icon={<Activity />}>
        {draft.media.protocol === 'smtc' ? <label className="settings-control-row">
          <span>
            <strong>{t('settings.preferredSource')}</strong>
            <small>{t('settings.preferredSourceHint')}</small>
          </span>
          <select value={draft.media.preferredSourceAppId ?? ''} onFocus={refreshSources} onChange={(event) => patchMedia({ preferredSourceAppId: event.currentTarget.value || null })}>
            <option value="">Auto</option>
            {mediaSessions.map((session) => <option key={session.sourceAppId} value={session.sourceAppId}>{session.sourceAppId}</option>)}
          </select>
        </label> : null}

        <div className="protocol-list">
          <article className={`protocol-row ${draft.media.protocol === 'smtc' ? 'protocol-row--selected' : ''}`}>
            <span className="protocol-icon"><RadioTower /></span>
            <div className="protocol-copy">
              <strong>Windows SMTC</strong>
              <small>{t('settings.smtcHint')}</small>
            </div>
            <div className="protocol-state">
              <StatusChip
                tone={smtcHealth.status === 'healthy' ? 'success' : 'warning'}
                className={`status-pill status-pill--${smtcHealth.status}`}
              >
                {smtcHealth.status === 'healthy' ? <CheckCircle2 /> : <TriangleAlert />}
                {smtcHealth.status}
              </StatusChip>
              <small>{smtcHealth.lastProbeMs} ms · {smtcHealth.sessionCount} {t('settings.sessions')}</small>
            </div>
            {draft.media.protocol !== 'smtc' ? (
              <button type="button" className="secondary-button" disabled={directBusy} onClick={() => void switchToLegacy()}>{t('settings.use')}</button>
            ) : <span className="active-protocol-label">{t('settings.active')}</span>}
          </article>

          <article className={`protocol-row ${draft.media.protocol === 'yandex-direct' ? 'protocol-row--selected' : ''}`}>
            <span className="protocol-icon protocol-icon--yandex"><Music2 /></span>
            <div className="protocol-copy">
              <strong>Direct Yandex Music</strong>
              <small>{directMessage}</small>
            </div>
            <div className="protocol-state">
              <StatusChip
                tone={directStatus.state === 'connected' ? 'success' : directStatus.state === 'degraded' ? 'warning' : 'neutral'}
                className={`status-pill status-pill--${directStatus.state}`}
              >
                {directStatus.state === 'connected' ? <CheckCircle2 /> : <Activity />}
                {directStatus.state}
              </StatusChip>
              {directStatus.port ? <small>127.0.0.1:{directStatus.port}</small> : null}
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
      </SettingsSection>

      <SettingsSection title={t('settings.system')} icon={<Power />}>
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

      <SettingsSection title={t('settings.about')} icon={<Info />}>
        <div className="about-block">
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
            <strong className="about-update__version">Music Island v{APP_VERSION}</strong>
            <div className="about-update-row">
              <span className={`about-update-status about-update-status--${updater.status}`}>
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
                          : updater.status === 'error'
                            ? t('settings.updateError')
                            : updater.result?.message ?? t('settings.checkForUpdates')}
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
        <div className="consent-backdrop" role="presentation">
          <section className="consent-dialog" role="dialog" aria-modal="true" aria-labelledby="direct-title">
            <TriangleAlert size={28} />
            <h2 id="direct-title">{t('consent.title')}</h2>
            <p>{t('consent.body')}</p>
            <ul>
              <li>{t('consent.li1')}</li>
              <li>{t('consent.li2')}</li>
              <li>{t('consent.li3')}</li>
            </ul>
            <div className="consent-actions">
              <button type="button" className="secondary-button" onClick={dismissConsent}>{directBusy ? t('consent.close') : t('consent.cancel')}</button>
              <button type="button" className="primary-button" disabled={directBusy} onClick={() => void connectDirect()}>{directBusy ? t('consent.connecting') : t('settings.connect')}</button>
            </div>
          </section>
        </div>
      ), document.body) : null}
    </section>
  )
}

function directStatusEqual(left: DirectYandexStatus, right: DirectYandexStatus): boolean {
  return left.state === right.state
    && left.message === right.message
    && left.port === right.port
    && left.executablePath === right.executablePath
}

interface SettingsSectionProps {
  title: string
  icon: ReactNode
  children: ReactNode
  action?: ReactNode
}

function SettingsSection({ title, icon, children, action }: SettingsSectionProps) {
  return (
    <GlassSurface as="section" className="settings-section">
      <header className="settings-section-header">
        <div className="settings-section-title">
          {icon}
          <h2>{title}</h2>
        </div>
        {action}
      </header>
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
