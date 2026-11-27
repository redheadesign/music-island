import type { ModelInfo } from '../../shared/lib/dictationTypes'
import { dictationModelNotices } from '../../shared/lib/dictationModelNotices'

export const primaryRecommendationRank = 3
export const gigaamCompactId = 'gigaam-v4-rnnt-compact'
export const gigaamStreamingId = 'gigaam-v4-rnnt'

function gigaamV4Variants(models: ModelInfo[], selected: string | undefined) {
  const compact = models.find(model => model.id === gigaamCompactId)
  const streaming = models.find(model => model.id === gigaamStreamingId)
  if (!compact || !streaming) return null
  const representative = streaming.is_downloaded && (streaming.id === selected || !compact.is_downloaded) ? streaming : compact
  return { compact, streaming, representative }
}

function russianModelRank(model: ModelInfo) {
  if (model.id === gigaamStreamingId || model.id === gigaamCompactId) return primaryRecommendationRank
  if (/gigaam-v3-e2e-rnnt.*Q8_0/i.test(model.id)) return 2
  return /gigaam-v3-(?:e2e-)?ctc/i.test(model.id) ? 1 : 0
}

export function recommendationRank(model: ModelInfo, locale: 'ru' | 'en') {
  if (locale === 'ru') return russianModelRank(model)
  if (!model.supported_languages.includes('en')) return 0
  return /parakeet-unified-en-0\.6b.*Q8_0/i.test(model.id) ? primaryRecommendationRank : model.is_recommended ? 1 : 0
}

export function catalogLanguages(models: ModelInfo[], locale: 'ru' | 'en') {
  const names = new Intl.DisplayNames([locale], { type: 'language' })
  const label = (code: string) => {
    let text = code
    try { text = names.of(code) ?? code } catch { /* Preserve unknown imported language codes. */ }
    return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
  }
  const rest = [...new Set(models.flatMap(model => model.supported_languages))].filter(code => code !== 'en' && code !== 'ru')
    .map(code => ({ code, label: label(code) })).sort((a, b) => a.label.localeCompare(b.label, locale))
  return [...['en', 'ru'].map(code => ({ code, label: label(code) })), ...rest]
}

export function groupModels(models: ModelInfo[], selected: string | undefined, query: string, languages: readonly string[], locale: 'ru' | 'en' = 'ru') {
  const variants = gigaamV4Variants(models, selected)
  const hiddenVariant = variants && (variants.representative === variants.compact ? variants.streaming : variants.compact)
  const visible = hiddenVariant ? models.filter(model => model !== hiddenVariant) : models
  const singleLanguage = languages.length === 1 ? languages[0] : undefined
  const catalogLanguage = singleLanguage === 'ru' || singleLanguage === 'en' ? singleLanguage : locale
  const matches = (model: ModelInfo) => `${model.name} ${model.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  const installed = visible.filter((model) => (model.is_downloaded || model.id === selected) && (model.id === selected || matches(model)))
    .sort((a, b) => Number(b.id === selected) - Number(a.id === selected) || recommendationRank(b, locale) - recommendationRank(a, locale) || a.name.localeCompare(b.name, locale))
  // Stable sort preserves the pinned native catalog's editorial order for ties.
  const catalog = visible.filter((model) => !model.is_downloaded && model.id !== selected && matches(model) && (!languages.length || languages.some(language => model.supported_languages.includes(language)) || model.is_custom))
    .sort((a, b) => recommendationRank(b, catalogLanguage) - recommendationRank(a, catalogLanguage) || Number(b.is_recommended) - Number(a.is_recommended))
  return { installed, catalog, variants }
}

export function modelNotice(model: ModelInfo) {
  if (model.source === 'GigaAMFiles') return dictationModelNotices[model.id === gigaamCompactId ? gigaamStreamingId : model.id] ?? null
  if (typeof model.source !== 'object' || !('HuggingFace' in model.source)) return null
  return dictationModelNotices[model.source.HuggingFace.repo_id] ?? null
}

export function modelLanguages(model: ModelInfo, locale: 'ru' | 'en') {
  const languages = model.supported_languages
  if (!languages.length) return locale === 'ru' ? 'Языки зависят от модели' : 'Languages depend on the model'
  const names = new Intl.DisplayNames([locale], { type: 'language' })
  const ordered = [...languages].sort((a, b) => Number(b === locale) - Number(a === locale))
  const first = ordered.slice(0, languages.length > 3 ? 2 : 3).map(code => { try { return names.of(code) ?? code } catch { return code } })
  const text = first.join(', ')
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1) + (languages.length > 3 ? ` +${languages.length - 2}` : '')
}

export function formatModelSize(mb: number, locale: string) {
  const ru = locale === 'ru'
  return mb >= 1024 ? `${(mb / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} ${ru ? 'ГБ' : 'GB'}` : `${mb.toLocaleString(locale, { maximumFractionDigits: 0 })} ${ru ? 'МБ' : 'MB'}`
}

export function formatDownloadBytes(bytes: number, locale: string) {
  const gb = bytes >= 1_000_000_000
  const value = bytes / (gb ? 1_000_000_000 : 1_000_000)
  const unit = locale === 'ru' ? (gb ? 'ГБ' : 'МБ') : (gb ? 'GB' : 'MB')
  return `${value.toLocaleString(locale, { maximumFractionDigits: gb ? 2 : 0 })} ${unit}`
}

export const modelDownloadSize = (model: ModelInfo, locale: string) => model.size_bytes
  ? formatDownloadBytes(model.size_bytes, locale)
  : formatModelSize(model.size_mb, locale)
