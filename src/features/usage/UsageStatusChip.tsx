import type {
  UsageConnectionState,
  UsageProvider,
  UsageProviderSnapshot,
  UsageSnapshot,
  UsageWindow,
} from '../../shared/lib/usageTypes'
import { BrandLogo } from '../../shared/ui/BrandLogo'
import { clampUsagePercent, formatUsageWindowLabel, getUsageQuotaTone, type UsageLocale } from './usageFormat'
import './usage.css'

interface UsageStatusChipProps {
  snapshot: UsageSnapshot | null
  enabledProviders: UsageProvider[]
  compact?: boolean
  locale?: UsageLocale
}

const providerName = { codex: 'Codex', claude: 'Claude' } as const
const stateText: Record<UsageLocale, Record<UsageConnectionState, string>> = {
  ru: {
    disabled: 'Не подключено', connecting: 'Обновление', connected: 'Данные актуальны', stale: 'Данные устарели',
    'needs-auth': 'Нужно войти', unavailable: 'Приложение не найдено', error: 'Лимиты недоступны',
  },
  en: {
    disabled: 'Not connected', connecting: 'Refreshing', connected: 'Up to date', stale: 'Data is stale',
    'needs-auth': 'Sign in required', unavailable: 'App not found', error: 'Limits unavailable',
  },
}

export function UsageStatusChip({
  snapshot,
  enabledProviders,
  compact = true,
  locale = 'ru',
}: UsageStatusChipProps) {
  if (enabledProviders.length === 0) return null

  return (
    <div
      className={['usage-chip', compact ? 'usage-chip--compact' : 'usage-chip--expanded'].join(' ')}
      data-layout={compact ? 'compact' : 'expanded'}
      role="status"
    >
      {enabledProviders.map((provider) => {
        const data = snapshot?.[provider]
        return compact
          ? <CompactProvider key={provider} provider={provider} data={data} locale={locale} />
          : <ExpandedProvider key={provider} provider={provider} data={data} locale={locale} />
      })}
    </div>
  )
}

function CompactProvider({
  provider,
  data,
  locale,
}: {
  provider: UsageProvider
  data: UsageProviderSnapshot | undefined
  locale: UsageLocale
}) {
  const window = mostConstrainedWindow(data)
  const remaining = clampUsagePercent(window?.remainingPercent ?? null)
  const tone = getUsageQuotaTone(remaining)
  const state = data?.state ?? 'connecting'
  const summary = providerSummary(data, locale)

  return (
    <span
      className={`usage-chip__compact-provider island-surface usage-chip__provider--${state}`}
      data-tone={tone}
      title={`${providerName[provider]} · ${summary}`}
      aria-label={`${providerName[provider]}: ${summary}`}
    >
      <span className="usage-chip__ring-logo">
      <svg className="usage-chip__ring" viewBox="0 0 36 36" aria-hidden="true">
        <circle className="usage-chip__ring-track" cx="18" cy="18" r="15.5" pathLength="100" />
        <circle className="usage-chip__ring-value" cx="18" cy="18" r="15.5" pathLength="100" style={{ strokeDasharray: `${remaining ?? 0} 100` }} />
      </svg>
      <BrandLogo brand={provider} size={16} />
      </span>
      <strong className="usage-chip__compact-value" aria-hidden="true">{remaining == null ? '—' : `${Math.round(remaining)}%`}</strong>
    </span>
  )
}

function ExpandedProvider({
  provider,
  data,
  locale,
}: {
  provider: UsageProvider
  data: UsageProviderSnapshot | undefined
  locale: UsageLocale
}) {
  const state = data?.state ?? 'connecting'
  const windows = visibleWindows(data)
  return (
    <section className={`usage-chip__provider island-surface usage-chip__provider--${state}`}>
      <header className="usage-chip__provider-header">
        <span className="usage-chip__brand"><BrandLogo brand={provider} size={17} /></span>
        <strong>{providerName[provider]}</strong>
        <span className="usage-chip__state-dot" role="img" title={stateText[locale][state]} aria-label={stateText[locale][state]} />
      </header>
      <div className="usage-chip__windows">
        {windows.length > 0 ? windows.map((window) => (
          <QuotaWindow key={window.id} window={window} locale={locale} />
        )) : <span className="usage-chip__empty" aria-label={stateText[locale][state]}>—</span>}
      </div>
    </section>
  )
}

function QuotaWindow({ window, locale }: { window: UsageWindow; locale: UsageLocale }) {
  const remaining = clampUsagePercent(window.remainingPercent)
  const label = formatUsageWindowLabel(window.label, locale)
  const tone = getUsageQuotaTone(remaining)
  const remainingLabel = locale === 'ru' ? 'осталось' : 'remaining'
  return (
    <div className="usage-chip__window" data-tone={tone}>
      <div className="usage-chip__window-value">
        <strong>{remaining == null ? '—' : `${Math.round(remaining)}%`}</strong>
        <span>{label}</span>
      </div>
      <span
        className="usage-chip__bar"
        role="progressbar"
        aria-label={`${label}: ${remaining == null ? '—' : `${Math.round(remaining)}%`} ${remainingLabel}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={remaining == null ? undefined : Math.round(remaining)}
      >
        <i style={{ width: `${remaining ?? 0}%` }} />
      </span>
    </div>
  )
}

function visibleWindows(provider: UsageProviderSnapshot | undefined) {
  if (!provider || provider.state === 'connecting' || provider.state === 'disabled') return []
  return provider.windows.slice(0, 2)
}

function mostConstrainedWindow(provider: UsageProviderSnapshot | undefined) {
  return visibleWindows(provider).reduce<UsageWindow | undefined>((selected, window) => {
    if (!selected) return window
    const selectedRemaining = clampUsagePercent(selected.remainingPercent) ?? 101
    const remaining = clampUsagePercent(window.remainingPercent) ?? 101
    return remaining < selectedRemaining ? window : selected
  }, undefined)
}

function providerSummary(provider: UsageProviderSnapshot | undefined, locale: UsageLocale) {
  const windows = visibleWindows(provider)
  if (windows.length === 0) return stateText[locale][provider?.state ?? 'connecting']
  const remaining = locale === 'ru' ? 'осталось' : 'remaining'
  return windows.map((window) => {
    const value = clampUsagePercent(window.remainingPercent)
    return `${formatUsageWindowLabel(window.label, locale)} ${value == null ? '—' : `${Math.round(value)}%`} ${remaining}`
  }).join(' · ')
}
