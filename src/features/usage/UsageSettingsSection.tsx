import { Button } from '../../shared/ui/SettingsControls'
import { RotateCw, Unplug } from '../../shared/ui/SettingsIcons'
import type {
  UsagePreferences,
  UsageProvider,
  UsageProviderSnapshot,
  UsageSnapshot,
} from '../../shared/lib/usageTypes'
import { BrandLogo } from '../../shared/ui/BrandLogo'
import { StatusChip } from '../../shared/ui/StatusChip'
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
    codexConsent: 'Использует вход в Codex.',
    claude: 'Claude',
    claudeConsent: 'Запрашивает лимиты Anthropic через Claude Code.',
    connect: 'Подключить',
    connecting: 'Подключение…',
    disconnect: 'Отключить',
    refresh: 'Обновить',
    remaining: 'осталось',
    reset: 'Обновится',
    states: {
      disabled: 'Не подключено', connecting: 'Подключение…', connected: 'Подключено', stale: 'Данные устарели',
      'needs-auth': 'Войдите в приложение', unavailable: 'Приложение не найдено', error: 'Лимиты недоступны',
    },
  },
  en: {
    title: 'Assistant limits',
    codex: 'Codex',
    codexConsent: 'Uses your Codex sign-in.',
    claude: 'Claude',
    claudeConsent: 'Checks Anthropic limits using your Claude Code sign-in.',
    connect: 'Connect',
    connecting: 'Connecting…',
    disconnect: 'Disconnect',
    refresh: 'Refresh',
    remaining: 'remaining',
    reset: 'Resets',
    states: {
      disabled: 'Not connected', connecting: 'Connecting…', connected: 'Connected', stale: 'Data is stale',
      'needs-auth': 'Sign in to the app', unavailable: 'App not found', error: 'Limits unavailable',
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
  const failed = state === 'needs-auth' || state === 'unavailable' || state === 'error'
  const providerName = provider === 'codex' ? 'Codex' : 'Claude Code'
  const recovery = {
    'needs-auth': locale === 'ru' ? `Войдите в ${providerName} и обновите лимиты.` : `Sign in to ${providerName}, then refresh.`,
    'rate-limited': locale === 'ru' ? 'Сервис временно ограничил запросы. Обновление повторится автоматически.' : 'The service is limiting requests. Updates will resume automatically.',
    offline: locale === 'ru' ? 'Проверьте подключение к интернету.' : 'Check your internet connection.',
    'not-installed': locale === 'ru' ? `Для подключения нужен установленный ${providerName}.` : `Install ${providerName} to connect.`,
  } as const
  const detail = data?.messageCode && Object.hasOwn(recovery, data.messageCode) ? recovery[data.messageCode as keyof typeof recovery] : null
  return (
    <article className="usage-settings__provider">
      <div className="usage-settings__heading">
        <span className="usage-settings__icon"><BrandLogo brand={provider} size={24} /></span>
        <div>
          <strong>{provider === 'codex' ? text.codex : text.claude}</strong>
          {!enabled ? <small>{provider === 'codex' ? text.codexConsent : text.claudeConsent}</small> : null}
        </div>
        {enabled || state !== 'disabled' ? failed
          ? <StatusChip tone="danger" appearance="flat" role="status">{text.states[state]}</StatusChip>
          : <span className={`usage-settings__state usage-settings__state--${state}`}>{text.states[state]}</span> : null}
      </div>
      {enabled && (failed || state === 'stale') && detail ? <small className="usage-settings__limit-reset">{detail}</small> : null}
      {enabled && state === 'stale' && data?.fetchedAt != null ? <small className="usage-settings__limit-reset">{locale === 'ru' ? 'Последние данные' : 'Last updated'} · <time dateTime={new Date(data.fetchedAt * 1000).toISOString()}>{formatReset(data.fetchedAt, locale)}</time></small> : null}
      {enabled && data?.windows.length ? (
        <div className="usage-settings__limits">
          {data.windows.map((window) => (
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
    <section className="usage-settings" aria-label={text.title}>
      <ProviderCard provider="codex" enabled={preferences.codexEnabled} data={snapshot?.codex} busy={busyProvider === 'codex'} locale={locale} onConnect={() => onConnect('codex')} onDisconnect={() => onDisconnect('codex')} onRefresh={() => onRefresh('codex')} />
      <ProviderCard provider="claude" enabled={preferences.claudeEnabled} data={snapshot?.claude} busy={busyProvider === 'claude'} locale={locale} onConnect={() => onConnect('claude')} onDisconnect={() => onDisconnect('claude')} onRefresh={() => onRefresh('claude')} />
    </section>
  )
}
