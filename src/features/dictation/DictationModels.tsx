import { useState } from 'react'
import type { DictationController } from '../../app/useIslandApp'
import type { ModelInfo } from '../../shared/lib/dictationTypes'
import { openExternalUrl } from '../../app/tauriApi'
import { FolderOpen, Funnel } from '../../shared/ui/SettingsIcons'
import { Button, Notice, Input, SearchField, SettingsIconButton } from '../../shared/ui/SettingsControls'
import { ActionMenu } from '../../shared/ui/Select'
import { Modal } from '../../shared/ui/Modal'
import { ModelCard } from './ModelCard'
import { HandyImport } from './HandyImport'
import { DictationDisclosure } from './DictationSections'
import { catalogLanguages, formatModelSize, groupModels, modelNotice } from './modelCatalog'
import './DictationModelsLead.css'

export function DictationModels({ controller: c, locale }: { controller: DictationController; locale: 'ru' | 'en' }) {
  const ru = locale === 'ru'
  const [query, setQuery] = useState('')
  const [languageFilter, setLanguageFilter] = useState<{ locale: 'ru' | 'en'; codes: string[] }>(() => ({ locale, codes: [locale] }))
  const [confirmation, setConfirmation] = useState<{ model: ModelInfo; action: 'download' | 'delete' } | null>(null)
  const [custom, setCustom] = useState(false)
  const [path, setPath] = useState('')
  const [customError, setCustomError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { data, api } = c
  if (!data) return null
  const languages = languageFilter.locale === locale ? languageFilter.codes : [locale]
  const activeModel = data.models.find(model => model.is_downloaded && model.id === data.settings.selected_model)
  const groups = groupModels(data.models, undefined, query, languages, locale)
  const featured = activeModel ?? groups.installed[0] ?? groups.catalog[0]
  const installed = groups.installed.filter(model => model.id !== featured?.id)
  const catalog = groups.catalog.filter(model => model.id !== featured?.id)
  const toggleLanguage = (code: string) => setLanguageFilter(current => {
    const codes = current.locale === locale ? current.codes : [locale]
    return { locale, codes: codes.includes(code) ? codes.filter(language => language !== code) : [...codes, code] }
  })
  const run = (id: string, action: () => Promise<unknown>) => { void c.run(id, action).catch(() => {}) }
  const modelAction = (model: ModelInfo, action: 'download' | 'delete') => {
    setConfirmation(null)
    setErrors(current => ({ ...current, [model.id]: '' }))
    void c.run(`${action}:${model.id}`, () => action === 'download' ? api.downloadModel(model.id) : api.deleteModel(model.id)).catch(reason => setErrors(current => ({ ...current, [model.id]: String(reason) })))
  }
  const renderModel = (model: ModelInfo) => (
    <ModelCard
      key={model.id}
      model={model}
      locale={locale}
      selected={model.id === activeModel?.id}
      loaded={data.modelStatus?.is_loaded && data.modelStatus.current_model === model.id}
      downloading={model.is_downloading || c.busy === `download:${model.id}`}
      busy={c.busy === `delete:${model.id}` || c.busy === 'select-model'}
      progress={c.progress[model.id]}
      error={errors[model.id]}
      onDownload={() => setConfirmation({ model, action: 'download' })}
      onDelete={() => setConfirmation({ model, action: 'delete' })}
      onCancel={() => run('cancel-download', () => api.cancelDownload(model.id))}
      onSelect={() => run('select-model', () => api.setActiveModel(model.id))}
    />
  )
  const catalogTitle = ru ? 'Каталог' : 'Catalog'
  return <>
    <h2 className="settings-page-heading">{ru ? 'Модели' : 'Models'}</h2>
    {featured ? <div key={featured.id} className="dictation-state-in">{renderModel(featured)}</div> : null}
    <div className="dictation-models__filters">
      <SearchField value={query} onChange={setQuery} label={ru ? 'Найти модель' : 'Find a model'} clearLabel={ru ? 'Очистить поиск' : 'Clear search'} />
      <ActionMenu
        label={ru ? 'Фильтр по языкам' : 'Filter by language'}
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
    {!groups.installed.length && !groups.catalog.length ? <p className="dictation-empty">{ru ? 'Нет моделей. Измените запрос или фильтр.' : 'No models found. Change the search or filter.'}</p> : null}
    <DictationDisclosure title={ru ? 'Хранилище моделей' : 'Model storage'}>
      <div className="dictation-models__storage">
        <code>{data.path}</code>
        <SettingsIconButton size="compact" variant="ghost" label={ru ? 'Открыть папку' : 'Open folder'} onClick={() => run('open-folder', () => api.openAppDataDir())}><FolderOpen size={17} aria-hidden="true" /></SettingsIconButton>
      </div>
    </DictationDisclosure>
    {confirmation ? <Modal label={confirmation.action === 'download' ? ru ? 'Скачать модель?' : 'Download model?' : ru ? 'Удалить модель?' : 'Delete model?'} onClose={() => setConfirmation(null)}><h3>{confirmation.action === 'download' ? ru ? 'Скачать модель?' : 'Download model?' : ru ? 'Удалить модель?' : 'Delete model?'}</h3><p>{confirmation.model.name} · {formatModelSize(confirmation.model.size_mb, locale)}</p><code className="data-settings__path">{data.path}</code>{modelNotice(confirmation.model) ? <Button variant="ghost" size="compact" onClick={() => void openExternalUrl(modelNotice(confirmation.model)!.url)}>{ru ? 'Условия модели' : 'Model terms'} · {modelNotice(confirmation.model)!.license}</Button> : null}<p>{confirmation.action === 'download' ? ru ? 'Модель останется после удаления EXE.' : 'The model stays if you delete the EXE.' : ru ? 'Удалится только файл модели.' : 'Only the model file will be deleted.'}</p><div className="dictation-dialog__actions"><Button onClick={() => setConfirmation(null)}>{ru ? 'Отмена' : 'Cancel'}</Button><Button variant={confirmation.action === 'delete' ? 'danger' : 'primary'} onClick={() => modelAction(confirmation.model, confirmation.action)}>{confirmation.action === 'download' ? ru ? 'Скачать' : 'Download' : ru ? 'Удалить' : 'Delete'}</Button></div></Modal> : null}
    <Modal open={custom} label={ru ? 'Добавить файл модели' : 'Add a model file'} onClose={() => { if (c.busy !== 'custom-model') setCustom(false) }}><h3>{ru ? 'Добавить файл модели' : 'Add a model file'}</h3><p>{ru ? 'Путь к файлу GGUF или BIN. Исходник сохранится.' : 'Enter a GGUF or BIN path. The original stays.'}</p><form onSubmit={async event => { event.preventDefault(); setCustomError(''); try { await c.run('custom-model', () => api.importCustomModel(path.trim())); setCustom(false); setPath('') } catch (reason) { setCustomError(String(reason)) } }}><Input aria-label={ru ? 'Путь к модели' : 'Model path'} value={path} onChange={event => setPath(event.target.value)} style={{ width: '100%' }} />{customError ? <Notice tone="danger">{customError}</Notice> : null}<div className="dictation-dialog__actions"><Button disabled={c.busy === 'custom-model'} onClick={() => setCustom(false)}>{ru ? 'Отмена' : 'Cancel'}</Button><Button variant="primary" type="submit" disabled={!path.trim() || c.busy === 'custom-model'}>{c.busy === 'custom-model' ? ru ? 'Копирование…' : 'Copying…' : ru ? 'Скопировать' : 'Copy model'}</Button></div></form></Modal>
  </>
}
