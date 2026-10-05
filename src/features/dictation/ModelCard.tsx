import type { ModelInfo } from '../../shared/lib/dictationTypes'
import { Check, Download, Sparkle, Trash2 } from '../../shared/ui/SettingsIcons'
import { Button, SettingsIconButton, Notice } from '../../shared/ui/SettingsControls'
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
}

/** The same content hierarchy for catalog, installed and imported models. */
export function ModelCard({ model, locale, selected, loaded, downloading = model.is_downloading, busy, progress = 0, error, onDownload, onSelect, onCancel, onDelete }: ModelCardProps) {
  const ru = locale === 'ru'
  const rank = recommendationRank(model, locale)
  const recommendation = rank === 2 ? ru ? 'Для русского' : 'For English' : ru ? 'Рекомендуемое' : 'Recommended'
  return <article className="dictation-model" data-selected={selected || undefined} aria-label={model.name}>
    <header className="dictation-model__heading"><div className="dictation-model__title"><h3>{model.name}</h3>{rank ? <StatusChip appearance="flat" tone={rank === 2 ? 'accent' : 'neutral'}><Sparkle size={12} weight="fill" />{recommendation}</StatusChip> : null}</div><span className="dictation-model__size">{formatModelSize(model.size_mb, locale)}</span></header>
    <p className="dictation-model__description">{modelLanguages(model, locale)}{model.supports_streaming ? ru ? ' · Текст во время записи' : ' · Live transcription' : ''}</p>
    {error ? <Notice tone="danger">{error}</Notice> : null}
    <footer className="dictation-model__actions">
    {selected || loaded ? <div className="dictation-model__badges">
          {selected ? <StatusChip appearance="flat" tone="success"><Check size={12} />{ru ? 'Выбрана' : 'Selected'}</StatusChip> : null}
      {loaded ? <span className="dictation-model__loaded">{ru ? 'В памяти' : 'In memory'}</span> : null}
    </div> : null}
      {downloading ? <div className="dictation-model__download"><progress value={progress} max={100} aria-label={ru ? 'Загрузка модели' : 'Model download'} /><span>{Math.round(progress)}%</span><Button size="compact" variant="ghost" onClick={onCancel}>{ru ? 'Отменить' : 'Cancel'}</Button></div> : !model.is_downloaded ? <Button variant="primary" disabled={busy} onClick={onDownload}><Download size={16} />{error ? ru ? 'Повторить' : 'Retry' : model.partial_size ? ru ? 'Продолжить' : 'Resume' : ru ? 'Скачать' : 'Download'}</Button> : !selected ? <Button disabled={busy} onClick={onSelect}>{ru ? 'Использовать' : 'Use model'}</Button> : null}
      {model.is_downloaded && !downloading ? <SettingsIconButton className="dictation-model__delete" size="compact" variant="danger" label={`${ru ? 'Удалить модель' : 'Delete model'} ${model.name}`} disabled={busy} onClick={onDelete}><Trash2 size={17} /></SettingsIconButton> : null}
    </footer>
  </article>
}
