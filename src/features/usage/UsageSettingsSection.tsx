import { Button } from '../../shared/ui/SettingsControls'
import { RotateCw, Unplug } from '../../shared/ui/SettingsIcons'
import type {
  UsagePreferences,
  UsageProvider,
  UsageProviderSnapshot,
  UsageSnapshot,
} from '../../shared/lib/usageTypes'
import { BrandLogo } from '../../shared/ui/BrandLogo'
import { clampUsagePercent, formatUsageWindowLabel, getUsageQuotaTone, type UsageLocale } from './usageFormat'
import './usage.css'

interface UsageSettingsSectionProps {
  preferences: UsagePreferences
  snapshot: UsageSnapshot | null
  busyProvider: UsageProvider | null
  locale?: UsageLocale
  onConnect: (provider: UsageProvider) => void
  onDisconnect: (provider: UsageProvider) => void
  onRefresh: (provider: UsageProvider) => void
}

const copy = {
  ru: {
    title: 'Лимиты ассистентов',
    codex: 'Codex',
    codexConsent: 'Использует вход в установленном Codex.',
    claude: 'Claude',
    claudeConsent: 'Использует вход в Claude Code для запроса лимитов Anthropic.',
    connect: 'Подключить',
    connecting: 'Подключение…',
    disconnect: 'Отключить',
    refresh: 'Обновить',
    remaining: 'осталось',
    reset: 'Обновится',
    states: {
      disabled: 'Не подключено', connecting: 'Подключение…', connected: 'Подключено', stale: 'Данные устарели',
      'needs-auth': 'Нужно войти в приложение', unavailable: 'Приложение не найдено', error: 'Лимиты временно недоступны',
    },
  },
  en: {
    title: 'Assistant limits',
    codex: 'Codex',
    codexConsent: 'Uses your sign-in in the installed Codex app.',
    claude: 'Claude',
    claudeConsent: 'Uses your Claude Code sign-in to request quota from Anthropic.',
    connect: 'Connect',
    connecting: 'Connecting…',
    disconnect: 'Disconnect',
    refresh: 'Refresh',
    remaining: 'remaining',
    reset: 'Resets',
    states: {
      disabled: 'Not connected', connecting: 'Connecting…', connected: 'Connected', stale: 'Data is stale',
      'needs-auth': 'Sign in to the app', unavailable: 'App not found', error: 'Limits are temporarily unavailable',
    },
  },
} as const

function formatReset(timestamp: number, locale: UsageLocale) {
  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(timestamp * 1000))
}

function ProviderCard({
  provider,
  enabled,
  data,
  busy,
  locale,
  onConnect,
  onDisconnect,
  onRefresh,
}: {
  provider: UsageProvider
  enabled: boolean
  data: UsageProviderSnapshot | undefined
  busy: boolean
  locale: UsageLocale
  onConnect: () => void
  onDisconnect: () => void
  onRefresh: () => void
}) {
  const text = copy[locale]
  const state = data?.state ?? 'disabled'
  return (
    <article className="usage-settings__provider">
      <div className="usage-settings__heading">
        <span className="usage-settings__icon"><BrandLogo brand={provider} size={24} /></span>
        <div>
          <strong>{provider === 'codex' ? text.codex : text.claude}</strong>
          {!enabled ? <small>{provider === 'codex' ? text.codexConsent : text.claudeConsent}</small> : null}
        </div>
        <span className={`usage-settings__state usage-settings__state--${state}`}>{text.states[state]}</span>
      </div>
      {enabled && data?.windows.length ? (
        <div className="usage-settings__limits">
          {data.windows.slice(0, 2).map((window) => (
            <div className="usage-settings__limit" data-tone={getUsageQuotaTone(window.remainingPercent)} key={window.id}>
              <div className="usage-settings__limit-top">
                <b className="usage-settings__limit-label">{formatUsageWindowLabel(window.label, locale)}</b>
                <span className="usage-settings__limit-value">
                  {window.remainingPercent == null ? '—' : `${Math.round(clampUsagePercent(window.remainingPercent) ?? 0)}%`}
                  <small>{text.remaining}</small>
                </span>
              </div>
              <div
                className="usage-settings__meter"
                role="progressbar"
                aria-label={`${formatUsageWindowLabel(window.label, locale)}: ${window.remainingPercent == null ? '—' : `${Math.round(clampUsagePercent(window.remainingPercent) ?? 0)}%`} ${text.remaining}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={clampUsagePercent(window.remainingPercent) == null ? undefined : Math.round(clampUsagePercent(window.remainingPercent) ?? 0)}
              >
                <i style={{ width: `${clampUsagePercent(window.remainingPercent) ?? 0}%` }} />
              </div>
              {window.resetsAt == null ? null : <small className="usage-settings__limit-reset">{text.reset}: {formatReset(window.resetsAt, locale)}</small>}
            </div>
          ))}
        </div>
      ) : null}
      <div className="usage-settings__actions">
        {!enabled ? (
          <Button variant="primary" disabled={busy} onClick={onConnect}>
            {busy ? text.connecting : text.connect}
          </Button>
        ) : (
          <>
            <Button disabled={busy} onClick={onRefresh}><RotateCw aria-hidden="true" />{text.refresh}</Button>
            <Button disabled={busy} onClick={onDisconnect}><Unplug aria-hidden="true" />{text.disconnect}</Button>
          </>
        )}
      </div>
    </article>
  )
}

export function UsageSettingsSection({
  preferences,
  snapshot,
  busyProvider,
  locale = 'ru',
  onConnect,
  onDisconnect,
  onRefresh,
}: UsageSettingsSectionProps) {
  const text = copy[locale]
  return (
    <section className="usage-settings" aria-labelledby="usage-settings-title">
      <header><h2 id="usage-settings-title">{text.title}</h2></header>
      <ProviderCard provider="codex" enabled={preferences.codexEnabled} data={snapshot?.codex} busy={busyProvider === 'codex'} locale={locale} onConnect={() => onConnect('codex')} onDisconnect={() => onDisconnect('codex')} onRefresh={() => onRefresh('codex')} />
      <ProviderCard provider="claude" enabled={preferences.claudeEnabled} data={snapshot?.claude} busy={busyProvider === 'claude'} locale={locale} onConnect={() => onConnect('claude')} onDisconnect={() => onDisconnect('claude')} onRefresh={() => onRefresh('claude')} />
    </section>
  )
}
