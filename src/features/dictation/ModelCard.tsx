import type { ModelInfo } from '../../shared/lib/dictationTypes'
import { Check, Download, Sparkle } from '../../shared/ui/SettingsIcons'
import { Button } from '../../shared/ui/SettingsControls'
import { ActionMenu } from '../../shared/ui/Select'
import { StatusChip } from '../../shared/ui/StatusChip'
import { formatModelSize, modelLanguages, recommendationRank } from './modelCatalog'
import './dictation.css'

export interface ModelCardProps {
  model: ModelInfo
  locale: 'ru' | 'en'
  selected?: boolean
  loaded?: boolean
  downloading?: boolean
  busy?: boolean
  progress?: number
  error?: string
  onDownload: () => void
  onSelect: () => void
  onCancel: () => void
  onDelete: () => void
  onDetails: () => void
}

/** The same content hierarchy for catalog, installed and imported models. */
export function ModelCard({ model, locale, selected, loaded, downloading = model.is_downloading, busy, progress = 0, error, onDownload, onSelect, onCancel, onDelete, onDetails }: ModelCardProps) {
  const ru = locale === 'ru'
  const rank = recommendationRank(model, locale)
  const recommendation = rank === 2 ? ru ? 'Для русского' : 'For English' : ru ? 'Альтернатива' : 'Recommended'
  return <article className="dictation-model" data-selected={selected || undefined} aria-label={model.name}>
    <header className="dictation-model__heading"><div className="dictation-model__title"><h3>{model.name}</h3>{rank ? <StatusChip appearance="flat" tone={rank === 2 ? 'accent' : 'neutral'}><Sparkle size={12} weight="fill" />{recommendation}</StatusChip> : null}</div><span className="dictation-model__size">{formatModelSize(model.size_mb, locale)}</span></header>
    <p className="dictation-model__description">{modelLanguages(model, locale)}{model.supports_streaming ? ru ? ' · Текст во время записи' : ' · Live transcription' : ru ? ' · Текст после записи' : ' · Transcription after recording'}</p>
    {selected || loaded ? <div className="dictation-model__badges">
      {selected ? <StatusChip appearance="flat"><Check size={12} />{ru ? 'Выбрана' : 'Selected'}</StatusChip> : null}
      {loaded ? <span className="dictation-model__loaded">{ru ? 'В памяти' : 'In memory'}</span> : null}
    </div> : null}
    {error ? <p className="dictation-model__error" role="alert">{error}</p> : null}
    <footer className="dictation-model__actions">
      {downloading ? <div className="dictation-model__download"><progress value={progress} max={100} aria-label={ru ? 'Загрузка модели' : 'Model download'} /><span>{Math.round(progress)}%</span><Button size="compact" variant="ghost" onClick={onCancel}>{ru ? 'Отменить' : 'Cancel'}</Button></div> : !model.is_downloaded ? <Button variant="primary" disabled={busy} onClick={onDownload}><Download size={16} />{error ? ru ? 'Повторить' : 'Retry' : model.partial_size ? ru ? 'Продолжить' : 'Resume' : ru ? 'Скачать' : 'Download'}</Button> : !selected ? <Button disabled={busy} onClick={onSelect}>{ru ? 'Использовать' : 'Use model'}</Button> : null}
      <Button size="compact" variant="ghost" className="dictation-model__details" onClick={onDetails}>{ru ? 'Подробнее' : 'Details'}</Button>
      {model.is_downloaded && !downloading ? <ActionMenu label={`${ru ? 'Действия с моделью' : 'Model actions'} ${model.name}`} disabled={busy} items={[{ id: 'delete', label: ru ? 'Удалить модель' : 'Delete model', danger: true, onSelect: onDelete }]} /> : null}
    </footer>
  </article>
}
