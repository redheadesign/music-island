export type UsageLocale = 'ru' | 'en'
export type UsageQuotaTone = 'healthy' | 'watch' | 'low' | 'unknown'

export function formatUsageWindowLabel(label: string, locale: UsageLocale) {
  if (locale === 'en') return label
  return label.replace(/\s+h\b/i, '\u00a0ч').replace(/\s+d\b/i, '\u00a0д')
}

export function clampUsagePercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null
  return Math.min(100, Math.max(0, value))
}

export function getUsageQuotaTone(remainingPercent: number | null): UsageQuotaTone {
  const remaining = clampUsagePercent(remainingPercent)
  if (remaining == null) return 'unknown'
  if (remaining <= 20) return 'low'
  if (remaining <= 45) return 'watch'
  return 'healthy'
}
