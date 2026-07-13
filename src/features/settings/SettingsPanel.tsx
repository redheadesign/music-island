import { Activity, CheckCircle2, Copy, Download, Music2, Power, RadioTower, RotateCcw, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  disableDirectYandex,
  enableDirectYandex,
  getDirectYandexStatus,
  previewConfig,
} from '../../app/tauriApi'
import type {
  AppConfig,
  DirectYandexStatus,
  MediaSessionInfo,
  SmtcHealthSnapshot,
} from '../../shared/lib/types'

interface SettingsPanelProps {
  config: AppConfig
  updateMessage: string | null
  smtcHealth: SmtcHealthSnapshot
  mediaSessions: MediaSessionInfo[]
  onChange: (config: AppConfig) => void
  onResetPosition: () => void
  onCheckUpdates: () => void
  onCopyDiagnostics: () => void
  onRefreshSources: () => void
}

export function SettingsPanel({
  config,
  updateMessage,
  smtcHealth,
  mediaSessions,
  onChange,
  onResetPosition,
  onCheckUpdates,
  onCopyDiagnostics,
  onRefreshSources,
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

  useEffect(() => setDraft(config), [config])
  useEffect(() => {
    let active = true
    const refresh = () => {
      void getDirectYandexStatus().then((status) => {
        if (active) setDirectStatus(status)
      })
    }
    refresh()
    const timer = window.setInterval(refresh, 1_000)
    onRefreshSources()
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [onRefreshSources])

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

  const connectDirect = async () => {
    const attempt = ++connectAttempt.current
    setDirectBusy(true)
    try {
      const status = await Promise.race([enableDirectYandex(), waitForDirectConnection()])
      if (connectAttempt.current !== attempt) return
      setDirectStatus(status)
      patchMedia({ protocol: 'yandex-direct', directYandexConsent: true })
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
      patchMedia({ protocol: 'smtc' })
    } finally {
      setDirectBusy(false)
    }
  }

  return (
    <section className="settings-panel" aria-label="Island settings">
      <header className="settings-hero">
        <div>
          <span className="settings-eyebrow">Music Island 0.9</span>
          <h1>Настройки</h1>
          <p>Только то, что меняет поведение островка.</p>
        </div>
      </header>

      <SettingsSection title="Островок" icon={<Music2 />}>
        <label className="settings-control-row">
          <span>
            <strong>Ширина</strong>
            <small>Ширина раскрытого островка</small>
          </span>
          <div className="range-control">
            <input type="range" min="80" max="125" value={draft.layout.width} onChange={(event) => patchLayout({ width: Number(event.currentTarget.value), size: 'medium' })} />
            <output>{draft.layout.width}%</output>
          </div>
        </label>

        <label className="settings-control-row">
          <span>
            <strong>Масштаб</strong>
            <small>Пропорционально уменьшает весь интерфейс</small>
          </span>
          <div className="range-control">
            <input type="range" min="70" max="120" value={draft.layout.scale} onChange={(event) => patchLayout({ scale: Number(event.currentTarget.value) })} />
            <output>{draft.layout.scale}%</output>
          </div>
        </label>

        <label className="settings-control-row">
          <span>
            <strong>Задержка открытия</strong>
            <small>Как долго удерживать каплю до раскрытия</small>
          </span>
          <div className="range-control">
            <input type="range" min="80" max="1200" step="20" value={draft.behavior.hoverDelayMs} onChange={(event) => patchBehavior({ hoverDelayMs: Number(event.currentTarget.value) })} />
            <output>{draft.behavior.hoverDelayMs} ms</output>
          </div>
        </label>
      </SettingsSection>

      <SettingsSection title="Источник музыки" icon={<Activity />}>
        <label className="settings-control-row">
          <span>
            <strong>Предпочитаемый источник</strong>
            <small>Auto сохраняет текущий играющий источник</small>
          </span>
          <select value={draft.media.preferredSourceAppId ?? ''} onFocus={onRefreshSources} onChange={(event) => patchMedia({ preferredSourceAppId: event.currentTarget.value || null })}>
            <option value="">Auto</option>
            {mediaSessions.map((session) => <option key={session.sourceAppId} value={session.sourceAppId}>{session.sourceAppId}</option>)}
          </select>
        </label>

        <div className="protocol-list">
          <article className={`protocol-row ${draft.media.protocol === 'smtc' ? 'protocol-row--selected' : ''}`}>
            <span className="protocol-icon"><RadioTower /></span>
            <div className="protocol-copy">
              <strong>Windows SMTC</strong>
              <small>Универсальный системный протокол</small>
            </div>
            <div className="protocol-state">
              <span className={`status-pill status-pill--${smtcHealth.status}`}>
                {smtcHealth.status === 'healthy' ? <CheckCircle2 /> : <TriangleAlert />}
                {smtcHealth.status}
              </span>
              <small>{smtcHealth.lastProbeMs} ms · {smtcHealth.sessionCount} сесс.</small>
            </div>
            {draft.media.protocol !== 'smtc' ? (
              <button type="button" className="secondary-button" disabled={directBusy} onClick={() => void switchToLegacy()}>Использовать</button>
            ) : <span className="active-protocol-label">Активен</span>}
          </article>

          <article className={`protocol-row ${directStatus.state === 'connected' ? 'protocol-row--selected' : ''}`}>
            <span className="protocol-icon protocol-icon--yandex"><Music2 /></span>
            <div className="protocol-copy">
              <strong>Direct Yandex Music</strong>
              <small>{directStatus.message}</small>
            </div>
            <div className="protocol-state">
              <span className={`status-pill status-pill--${directStatus.state}`}>
                {directStatus.state === 'connected' ? <CheckCircle2 /> : <Activity />}
                {directStatus.state}
              </span>
              {directStatus.port ? <small>127.0.0.1:{directStatus.port}</small> : null}
            </div>
            {directStatus.state === 'connected' ? (
              <button type="button" className="secondary-button" disabled={directBusy} onClick={() => void switchToLegacy()}>Отключить</button>
            ) : (
              <button type="button" className="primary-button" disabled={directBusy} onClick={() => setShowConsent(true)}>Подключить</button>
            )}
          </article>
        </div>
      </SettingsSection>

      <SettingsSection title="Система" icon={<Power />}>
        <Toggle label="Запускать вместе с Windows" checked={draft.behavior.launchAtStartup} onChange={(launchAtStartup) => patchBehavior({ launchAtStartup })} />
        <div className="settings-actions">
          <button type="button" onClick={onResetPosition}><RotateCcw /> Сбросить позицию</button>
          <button type="button" onClick={onCheckUpdates}><Download /> Проверить обновления</button>
          <button type="button" onClick={onCopyDiagnostics}><Copy /> Скопировать диагностику</button>
        </div>
      </SettingsSection>

      {updateMessage ? <p className="settings-note">{updateMessage}</p> : null}

      {showConsent ? createPortal((
        <div className="consent-backdrop" role="presentation">
          <section className="consent-dialog" role="dialog" aria-modal="true" aria-labelledby="direct-title">
            <TriangleAlert size={28} />
            <h2 id="direct-title">Прямое подключение к Yandex Music</h2>
            <p>Music Island закроет и автоматически запустит десктопный клиент с локальным debug endpoint на случайном порту.</p>
            <ul>
              <li>endpoint доступен только через 127.0.0.1;</li>
              <li>интеграция экспериментальная и может сломаться после обновления клиента;</li>
              <li>вернуться на Windows SMTC можно в любой момент.</li>
            </ul>
            <div className="consent-actions">
              <button type="button" className="secondary-button" onClick={dismissConsent}>{directBusy ? 'Закрыть' : 'Отмена'}</button>
              <button type="button" className="primary-button" disabled={directBusy} onClick={() => void connectDirect()}>{directBusy ? 'Подключение…' : 'Закрыть клиент и подключить'}</button>
            </div>
          </section>
        </div>
      ), document.body) : null}
    </section>
  )
}

async function waitForDirectConnection(): Promise<DirectYandexStatus> {
  const deadline = Date.now() + 35_000
  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, 350))
    const status = await getDirectYandexStatus()
    if (status.state === 'connected') return status
    if (status.state === 'error' || status.state === 'incompatible') {
      throw new Error(status.message)
    }
  }
  throw new Error('Direct connection timed out')
}

interface SettingsSectionProps {
  title: string
  icon: ReactNode
  children: ReactNode
}

function SettingsSection({ title, icon, children }: SettingsSectionProps) {
  return (
    <section className="settings-section">
      <header className="settings-section-header">
        {icon}
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  )
}

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="toggle settings-toggle">
      <strong>{label}</strong>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
    </label>
  )
}
