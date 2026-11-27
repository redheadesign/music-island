import type { ReactNode } from 'react'
import type { ModelInfo } from '../../shared/lib/dictationTypes'
import { Check, Download, Sparkle, Trash2 } from '../../shared/ui/SettingsIcons'
import { Button, SettingsIconButton, Notice } from '../../shared/ui/SettingsControls'
import { StatusChip } from '../../shared/ui/StatusChip'
import { modelDownloadSize, modelLanguages, primaryRecommendationRank, recommendationRank } from './modelCatalog'
import { ModelRatings } from './ModelRatings'
import './dictation.css'

export interface ModelCardProps {
  children?: ReactNode
  model: ModelInfo
  locale: 'ru' | 'en'
  selected?: boolean
  recognitionActive?: boolean
  loaded?: boolean
  downloading?: boolean
  busy?: boolean
  progress?: number
  error?: string
  onDownload: () => void
  onSelect: () => void
  onCancel: () => void
  onDelete: () => void
}

/** The same content hierarchy for catalog, installed and imported models. */
export function ModelCard({ children, model, locale, selected, recognitionActive, loaded, downloading = model.is_downloading, busy, progress = 0, error, onDownload, onSelect, onCancel, onDelete }: ModelCardProps) {
  const ru = locale === 'ru'
  const recommendedLanguage = recommendationRank(model, 'ru') === primaryRecommendationRank ? 'ru' : 'en'
  const rank = recommendationRank(model, recommendedLanguage)
  const recommendation = recommendedLanguage === 'ru'
    ? ru ? 'Рекомендовано для русского' : 'Recommended for Russian'
    : ru ? 'Рекомендовано для английского' : 'Recommended for English'
  return <article className="dictation-model" data-selected={selected || undefined} aria-label={model.name}>
    <header className="dictation-model__heading"><div className="dictation-model__title"><h3>{model.name}</h3>{rank ? <StatusChip appearance="flat" tone={rank === primaryRecommendationRank ? 'accent' : 'neutral'}><Sparkle size={12} weight="fill" />{recommendation}</StatusChip> : null}</div><span className="dictation-model__size">{modelDownloadSize(model, locale)}</span></header>
    {children}
    {error ? <Notice tone="danger">{error}</Notice> : null}
    <ModelRatings model={model} locale={locale} />
    <footer className="dictation-model__footer">
      <div className="dictation-model__details">
        <p className="dictation-model__description">{modelLanguages(model, locale)}{model.supports_streaming ? ru ? ' · Текст во время записи' : ' · Live transcription' : ''}</p>
        {model.is_downloaded || selected || loaded ? <div className="dictation-model__badges">
          {model.is_downloaded ? <StatusChip appearance="flat">{ru ? 'Скачано' : 'Downloaded'}</StatusChip> : null}
          {selected ? <StatusChip appearance="flat" tone="success"><Check size={12} />{ru ? 'Выбрана' : 'Selected'}</StatusChip> : null}
          {loaded ? <span className="dictation-model__loaded">{ru ? 'В памяти' : 'In memory'}</span> : null}
        </div> : null}
      </div>
      <div className="dictation-model__actions">
      {downloading ? <div className="dictation-model__download"><progress value={progress} max={100} aria-label={ru ? 'Загрузка модели' : 'Model download'} /><span>{Math.round(progress)}%</span><Button size="compact" variant="ghost" onClick={onCancel}>{ru ? 'Отменить' : 'Cancel'}</Button></div> : !model.is_downloaded ? <Button variant="primary" disabled={busy} onClick={onDownload}><Download size={16} />{error ? ru ? 'Повторить' : 'Retry' : model.partial_size ? ru ? 'Продолжить' : 'Resume' : ru ? 'Скачать' : 'Download'}</Button> : !selected ? <Button disabled={busy || recognitionActive} title={recognitionActive ? ru ? 'Доступно после распознавания' : 'Available after recognition' : undefined} onClick={onSelect}>{ru ? 'Использовать' : 'Use model'}</Button> : null}
      {model.is_downloaded && !downloading ? <SettingsIconButton className="dictation-model__delete" size="compact" variant="danger" label={`${ru ? 'Удалить модель' : 'Delete model'} ${model.name}`} disabled={busy || (selected && recognitionActive)} onClick={onDelete}><Trash2 size={17} /></SettingsIconButton> : null}
      </div>
    </footer>
  </article>
}
