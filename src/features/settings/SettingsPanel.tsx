import { Activity, CheckCircle2, Copy, Info, Music2, Power, RadioTower, RotateCcw, TriangleAlert } from 'lucide-react'
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
} from '../../app/tauriApi'

const APP_VERSION = '0.9.9'
import type {
  AppConfig,
  AutostartSyncEvent,
  DirectYandexStatus,
  Locale,
  MediaSessionInfo,
  SmtcHealthSnapshot,
} from '../../shared/lib/types'
import { createTranslator, directStatusMessage, normalizeLocale } from '../../shared/i18n/messages'
import { GlassSurface } from '../../shared/ui/GlassSurface'
import { StatusChip } from '../../shared/ui/StatusChip'

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

  useEffect(() => setDraft(config), [config])
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
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
        <h1>{t('settings.title')}</h1>
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
        <label className="settings-control-row">
          <span>
            <strong>{t('settings.width')}</strong>
            <small>{t('settings.widthHint')}</small>
          </span>
          <div className="range-control">
            <input type="range" min="80" max="125" value={draft.layout.width} onChange={(event) => patchLayout({ width: Number(event.currentTarget.value), size: 'medium' })} />
            <output>{draft.layout.width}%</output>
          </div>
        </label>

        <label className="settings-control-row">
          <span>
            <strong>{t('settings.scale')}</strong>
            <small>{t('settings.scaleHint')}</small>
          </span>
          <div className="range-control">
            <input type="range" min="70" max="120" value={draft.layout.scale} onChange={(event) => patchLayout({ scale: Number(event.currentTarget.value) })} />
            <output>{draft.layout.scale}%</output>
          </div>
        </label>

        <label className="settings-control-row">
          <span>
            <strong>{t('settings.hoverDelay')}</strong>
            <small>{t('settings.hoverDelayHint')}</small>
          </span>
          <div className="range-control">
            <input type="range" min="80" max="1200" step="20" value={draft.behavior.hoverDelayMs} onChange={(event) => patchBehavior({ hoverDelayMs: Number(event.currentTarget.value) })} />
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
          <strong>Music Island v{APP_VERSION}</strong>
          <p>{t('settings.aboutBody')}</p>
          <div className="about-links">
            <button
              type="button"
              className="about-link"
              onClick={() => void openExternalUrl('https://t.me/redheadesigner')}
            >
              Telegram · @redheadesigner
            </button>
            <button
              type="button"
              className="about-link"
              onClick={() => void openExternalUrl('https://github.com/redheadesign/music-island')}
            >
              {t('settings.githubSource')}
            </button>
            <button
              type="button"
              className="about-link"
              onClick={() => void openExternalUrl('https://github.com/redheadesign/music-island/blob/master/LICENSE')}
            >
              {t('settings.license')}
            </button>
          </div>
          <small>{t('settings.aboutLicense')}</small>
        </div>
      </SettingsSection>

      <footer className="settings-footer">
        <button type="button" className="settings-footer-action" onClick={onCopyDiagnostics}>
          <Copy />
          {t('settings.copyDiagnostics')}
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
