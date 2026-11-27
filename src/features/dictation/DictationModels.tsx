import { useState } from 'react'
import type { DictationController } from '../../app/useIslandApp'
import type { ModelInfo } from '../../shared/lib/dictationTypes'
import { openExternalUrl } from '../../app/tauriApi'
import { FolderOpen, Funnel } from '../../shared/ui/SettingsIcons'
import { Button, Notice, Input, SearchField, SettingsIconButton, Switch } from '../../shared/ui/SettingsControls'
import { ActionMenu } from '../../shared/ui/Select'
import { Modal } from '../../shared/ui/Modal'
import { ModelCard } from './ModelCard'
import { HandyImport } from './HandyImport'
import { SettingsDisclosure } from '../../shared/ui/SettingsDisclosure'
import { catalogLanguages, formatDownloadBytes, gigaamCompactId, gigaamStreamingId, groupModels, modelDownloadSize, modelNotice } from './modelCatalog'
import './DictationModelsLead.css'

export function DictationModels({ controller: c, locale }: { controller: DictationController; locale: 'ru' | 'en' }) {
  const ru = locale === 'ru'
  const [query, setQuery] = useState('')
  const [previewStreaming, setPreviewStreaming] = useState<boolean | null>(null)
  const [languageFilter, setLanguageFilter] = useState<{ locale: 'ru' | 'en'; codes: string[] }>(() => ({ locale, codes: [locale] }))
  const [confirmation, setConfirmation] = useState<{ model: ModelInfo; action: 'download' | 'delete' } | null>(null)
  const [custom, setCustom] = useState(false)
  const [path, setPath] = useState('')
  const [picking, setPicking] = useState(false)
  const [customError, setCustomError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { data, api } = c
  if (!data) return null
  const languages = languageFilter.locale === locale ? languageFilter.codes : [locale]
  const activeModel = data.models.find(model => model.is_downloaded && model.id === data.settings.selected_model)
  const phase = data.status?.phase
  const recognitionActive = phase === 'preparing' || phase === 'recording' || phase === 'streaming' || phase === 'transcribing'
  const groups = groupModels(data.models, activeModel?.id, query, languages, locale)
  const variants = groups.variants
  const extraSize = variants ? formatDownloadBytes(
    (variants.streaming.size_bytes ?? variants.streaming.size_mb * 1024 ** 2) -
    (variants.compact.size_bytes ?? variants.compact.size_mb * 1024 ** 2), locale,
  ) : ''
  const featured = activeModel ?? groups.installed[0] ?? groups.catalog[0]
  const installed = groups.installed.filter(model => model.id !== featured?.id)
  const catalog = groups.catalog.filter(model => model.id !== featured?.id)
  const toggleLanguage = (code: string) => setLanguageFilter(current => {
    const codes = current.locale === locale ? current.codes : [locale]
    return { locale, codes: codes.includes(code) ? codes.filter(language => language !== code) : [...codes, code] }
  })
  const run = (id: string, action: () => Promise<unknown>, after: Parameters<typeof c.run>[2] = 'none') => { void c.run(id, action, after).catch(() => {}) }
  const modelAction = (model: ModelInfo, action: 'download' | 'delete') => {
    setConfirmation(null)
    setErrors(current => ({ ...current, [model.id]: '' }))
    void c.run(`${action}:${model.id}`, () => action === 'download' ? api.downloadModel(model.id) : api.deleteModel(model.id), ['models', 'settings', 'runtime'], false).catch(reason => setErrors(current => ({ ...current, [model.id]: String(reason) })))
  }
  const renderModel = (entry: ModelInfo) => {
    const family = variants?.representative === entry ? variants : null
    const pending = family && [family.compact, family.streaming].find(pack => pack.is_downloading || c.busy === `download:${pack.id}`)
    const model = pending || (family && previewStreaming !== null ? (previewStreaming ? family.streaming : family.compact) : entry)
    return <ModelCard
      key={family ? gigaamCompactId : model.id}
      model={model}
      locale={locale}
      selected={model.id === activeModel?.id}
      recognitionActive={recognitionActive}
      loaded={data.modelStatus?.is_loaded && data.modelStatus.current_model === model.id}
      downloading={model.is_downloading || c.busy === `download:${model.id}`}
      busy={c.busy === `delete:${model.id}` || c.busy === 'select-model'}
      progress={c.progress[model.id]}
      error={errors[model.id]}
      onDownload={() => setConfirmation({ model, action: 'download' })}
      onDelete={() => setConfirmation({ model, action: 'delete' })}
      onCancel={() => run('cancel-download', () => api.cancelDownload(model.id), 'models')}
      onSelect={() => run('select-model', () => api.setActiveModel(model.id), ['models', 'settings', 'runtime'])}
    >
      {family ? <Switch
        label={ru ? 'Версия с текстом во время записи' : 'Live transcription package'}
        hint={ru
          ? `+${extraSize}. В компактной версии текст появляется после остановки записи.`
          : `+${extraSize}. The compact version transcribes after you stop recording.`}
        checked={model.id === gigaamStreamingId}
        disabled={Boolean(pending)}
        onChange={setPreviewStreaming}
      /> : null}
    </ModelCard>
  }
  const catalogTitle = ru ? 'Каталог' : 'Catalog'
  const dialogTitle = confirmation?.action === 'delete'
    ? ru ? 'Удалить модель?' : 'Delete model?'
    : ru ? 'Скачать модель?' : 'Download model?'
  const pickFile = async () => {
    setPicking(true); setCustomError('')
    try { const selected = await api.pickCustomModel(); if (selected) setPath(selected) }
    catch { setCustomError(ru ? 'Не удалось открыть выбор файла. Введите путь ниже.' : 'Could not open the file picker. Enter the path below.') }
    finally { setPicking(false) }
  }
  return <>
    <h2 className="settings-page-heading">{ru ? 'Модели' : 'Models'}</h2>
    {featured ? <div key={featured.id} className="dictation-state-in">{renderModel(featured)}</div> : null}
    <div className="dictation-models__filters">
      <SearchField value={query} onChange={setQuery} label={ru ? 'Найти модель' : 'Find a model'} clearLabel={ru ? 'Очистить поиск' : 'Clear search'} />
      <ActionMenu
        label={ru ? 'Фильтр по языкам каталога' : 'Filter catalog by language'}
        size="normal"
        icon={<Funnel size={20} weight={languages.length ? 'fill' : 'regular'} aria-hidden="true" />}
        items={catalogLanguages(data.models, locale).map(({ code, label }) => ({ id: code, label, checked: languages.includes(code), onSelect: () => toggleLanguage(code) }))}
      />
      <HandyImport
        controller={c}
        locale={locale}
        trigger={openImport => (
          <ActionMenu label={ru ? 'Добавить модель' : 'Add model'} items={[
            { id: 'handy', label: ru ? 'Импорт из Handy' : 'Import from Handy', onSelect: openImport },
            { id: 'custom', label: ru ? 'Добавить файл модели' : 'Add a model file', onSelect: () => { setCustomError(''); setCustom(true) } },
          ]} />
        )}
      />
    </div>
    {installed.length ? <div className="dictation-models">{installed.map(renderModel)}</div> : null}
    {catalog.length ? <section className="dictation-models" aria-label={catalogTitle}><h3>{catalogTitle}</h3>{catalog.map(renderModel)}</section> : null}
    {!groups.installed.length && !groups.catalog.length ? <div className="dictation-empty"><p role="status">{ru ? 'Подходящих моделей нет.' : 'No matching models.'}</p>
      {query || languages.length ? <Button variant="ghost" size="compact" onClick={() => { setQuery(''); setLanguageFilter({ locale, codes: [] }) }}>{ru ? 'Сбросить поиск и фильтр' : 'Clear search and filter'}</Button> : null}</div> : null}
    <SettingsDisclosure title={ru ? 'Хранилище моделей' : 'Model storage'}>
      <div className="dictation-models__storage">
        <code>{data.path}</code>
        <SettingsIconButton size="compact" variant="ghost" label={ru ? 'Открыть папку' : 'Open folder'} onClick={() => run('open-folder', () => api.openAppDataDir())}><FolderOpen size={17} aria-hidden="true" /></SettingsIconButton>
      </div>
    </SettingsDisclosure>
    {confirmation ? <Modal label={dialogTitle} onClose={() => setConfirmation(null)}>
      <h3>{dialogTitle}</h3>
      <p>{confirmation.model.name}{confirmation.model.id === gigaamCompactId ? ru ? ' · Компактная' : ' · Compact' : confirmation.model.id === gigaamStreamingId ? ru ? ' · С текстом во время записи' : ' · Live transcription' : ''} · {modelDownloadSize(confirmation.model, locale)}</p>
      {confirmation.action === 'download' && confirmation.model.id === gigaamStreamingId && variants?.compact.is_downloaded
        ? <p>{ru ? 'Дополнительно скачается' : 'Additional download'} · {extraSize}</p> : null}
      {confirmation.action === 'download' && confirmation.model.id === gigaamCompactId && variants?.streaming.is_downloaded
        ? <p>{ru ? 'Файлы будут взяты из установленной потоковой версии. Дополнительная загрузка · 0 Б.' : 'Files will be reused from the installed streaming package. Additional download · 0 B.'}</p> : null}
      <code className="data-settings__path">{data.path}</code>
      {modelNotice(confirmation.model) ? <Button variant="ghost" size="compact" onClick={() => void openExternalUrl(modelNotice(confirmation.model)!.url)}>{ru ? 'Условия модели' : 'Model terms'} · {modelNotice(confirmation.model)!.license}</Button> : null}
      <p>{confirmation.action === 'download' ? ru ? 'Модель останется после удаления EXE.' : 'The model stays if you delete the EXE.' : ru ? 'Будет удалён выбранный пакет модели.' : 'The selected model package will be deleted.'}</p>
      <div className="dictation-dialog__actions">
        <Button onClick={() => setConfirmation(null)}>{ru ? 'Отмена' : 'Cancel'}</Button>
        <Button variant={confirmation.action === 'delete' ? 'danger' : 'primary'} disabled={confirmation.action === 'delete' && recognitionActive && confirmation.model.id === activeModel?.id} onClick={() => modelAction(confirmation.model, confirmation.action)}>{confirmation.action === 'download' ? ru ? 'Скачать' : 'Download' : ru ? 'Удалить' : 'Delete'}</Button>
      </div>
    </Modal> : null}
    <Modal open={custom} label={ru ? 'Добавить файл модели' : 'Add a model file'} onClose={() => { if (!picking && c.busy !== 'custom-model') setCustom(false) }}><h3>{ru ? 'Добавить файл модели' : 'Add a model file'}</h3><p>{ru ? 'Выберите файл GGUF или BIN либо введите путь. Исходный файл сохранится.' : 'Choose a GGUF or BIN file, or enter its path. The original file stays in place.'}</p><form className="dictation-model-file" onSubmit={async event => { event.preventDefault(); setCustomError(''); try { await c.run('custom-model', () => api.importCustomModel(path.trim()), ['models', 'settings', 'runtime'], false); setCustom(false); setPath('') } catch (reason) { setCustomError(String(reason)) } }}><Button size="compact" disabled={picking || c.busy === 'custom-model'} onClick={() => void pickFile()}>{ru ? 'Выбрать файл…' : 'Choose file…'}</Button><Input aria-label={ru ? 'Путь к модели' : 'Model path'} value={path} onChange={event => setPath(event.target.value)} style={{ width: '100%' }} />{customError ? <Notice tone="danger">{customError}</Notice> : null}<div className="dictation-dialog__actions"><Button disabled={picking || c.busy === 'custom-model'} onClick={() => setCustom(false)}>{ru ? 'Отмена' : 'Cancel'}</Button><Button variant="primary" type="submit" disabled={picking || !path.trim() || c.busy === 'custom-model'}>{c.busy === 'custom-model' ? ru ? 'Копирование…' : 'Copying…' : ru ? 'Скопировать' : 'Copy model'}</Button></div></form></Modal>
  </>
}
