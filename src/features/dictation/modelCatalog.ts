import type { ModelInfo } from '../../shared/lib/dictationTypes'
import { dictationModelNotices } from '../../shared/lib/dictationModelNotices'

export const russianModelRank = (model: ModelInfo) => /gigaam-v3-e2e-rnnt.*Q8_0/i.test(model.id) ? 2 : /gigaam-v3-(?:e2e-)?ctc/i.test(model.id) ? 1 : 0

export function recommendationRank(model: ModelInfo, locale: 'ru' | 'en') {
  if (locale === 'ru') return russianModelRank(model)
  if (!model.supported_languages.includes('en')) return 0
  return /parakeet-unified-en-0\.6b.*Q8_0/i.test(model.id) ? 2 : model.is_recommended ? 1 : 0
}

export function groupModels(models: ModelInfo[], selected: string | undefined, query: string, allLanguages: boolean, locale: 'ru' | 'en' = 'ru') {
  const matches = (model: ModelInfo) => `${model.name} ${model.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  const installed = models.filter((model) => (model.is_downloaded || model.id === selected) && (model.id === selected || matches(model)))
    .sort((a, b) => Number(b.id === selected) - Number(a.id === selected) || recommendationRank(b, locale) - recommendationRank(a, locale) || a.name.localeCompare(b.name, locale))
  // Stable sort preserves the pinned native catalog's editorial order for ties.
  const catalog = models.filter((model) => !model.is_downloaded && model.id !== selected && matches(model) && (allLanguages || model.supported_languages.includes(locale) || model.is_custom))
    .sort((a, b) => recommendationRank(b, locale) - recommendationRank(a, locale) || Number(b.is_recommended) - Number(a.is_recommended))
  return { installed, catalog }
}

export function modelNotice(model: ModelInfo) {
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
