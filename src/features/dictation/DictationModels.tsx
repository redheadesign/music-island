import { useState } from 'react'
import type { DictationController } from '../../app/useIslandApp'
import type { ModelInfo } from '../../shared/lib/dictationTypes'
import { openExternalUrl } from '../../app/tauriApi'
import { FolderOpen } from '../../shared/ui/SettingsIcons'
import { Button, Input, Toggle, SearchField } from '../../shared/ui/SettingsControls'
import { ActionMenu } from '../../shared/ui/Select'
import { Modal } from '../../shared/ui/Modal'
import { ModelCard } from './ModelCard'
import { HandyImport } from './HandyImport'
import { formatModelSize, groupModels, modelLanguages, modelNotice } from './modelCatalog'

export function DictationModels({ controller: c, locale }: { controller: DictationController; locale: 'ru' | 'en' }) {
  const ru = locale === 'ru'
  const [query, setQuery] = useState('')
  const [allLanguages, setAllLanguages] = useState(false)
  const [confirmation, setConfirmation] = useState<{ model: ModelInfo; action: 'download' | 'delete' } | null>(null)
  const [details, setDetails] = useState<ModelInfo | null>(null)
  const [custom, setCustom] = useState(false)
  const [path, setPath] = useState('')
  const [customError, setCustomError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { data, api } = c
  if (!data) return null
  const groups = groupModels(data.models, data.settings.selected_model, query, allLanguages, locale)
  const run = (id: string, action: () => Promise<unknown>) => { void c.run(id, action).catch(() => {}) }
  const modelAction = (model: ModelInfo, action: 'download' | 'delete') => {
    setConfirmation(null)
    setErrors(current => ({ ...current, [model.id]: '' }))
    void c.run(`${action}:${model.id}`, () => action === 'download' ? api.downloadModel(model.id) : api.deleteModel(model.id)).catch(reason => setErrors(current => ({ ...current, [model.id]: String(reason) })))
  }
  return <>
    <div className="dictation-models__toolbar"><h2 className="settings-page-heading">{ru ? 'Модели' : 'Models'}</h2><HandyImport controller={c} locale={locale} /><ActionMenu label={ru ? 'Другие способы добавления' : 'Other ways to add a model'} items={[{ id: 'custom', label: ru ? 'Добавить файл модели' : 'Add a model file', onSelect: () => { setCustomError(''); setCustom(true) } }]} /></div>
    <div className="dictation-models__filters"><SearchField value={query} onChange={setQuery} label={ru ? 'Найти модель' : 'Find a model'} clearLabel={ru ? 'Очистить поиск' : 'Clear search'} /><label className="dictation-models__language"><span>{ru ? 'Все языки' : 'All languages'}</span><Toggle aria-label={ru ? 'Показать все языки' : 'Show all languages'} checked={allLanguages} onChange={setAllLanguages} /></label></div>
    {([['installed', ru ? 'На компьютере' : 'On this computer', groups.installed], ['catalog', ru ? 'Скачать модель' : 'Download a model', groups.catalog]] as const).map(([id, title, items]) => items.length ? <section className="dictation-models" key={id} aria-label={title}><h3>{title}</h3>{items.map(model => <ModelCard key={model.id} model={model} locale={locale} selected={model.id === data.settings.selected_model} loaded={data.modelStatus?.is_loaded && data.modelStatus.current_model === model.id} downloading={model.is_downloading || c.busy === `download:${model.id}`} busy={c.busy === `delete:${model.id}` || c.busy === 'select-model'} progress={c.progress[model.id]} error={errors[model.id]} onDownload={() => setConfirmation({ model, action: 'download' })} onDelete={() => setConfirmation({ model, action: 'delete' })} onCancel={() => run('cancel-download', () => api.cancelDownload(model.id))} onSelect={() => run('select-model', () => api.setActiveModel(model.id))} onDetails={() => setDetails(model)} />)}</section> : null)}
    {!groups.installed.length && !groups.catalog.length ? <p className="dictation-empty">{ru ? 'Модели не найдены. Измените запрос или включите все языки.' : 'No models found. Try another search or enable all languages.'}</p> : null}
    <section className="dictation-storage"><FolderOpen size={17} /><div><strong>{ru ? 'Хранилище диктовки' : 'Dictation storage'}</strong><code>{data.path}</code><p>{ru ? 'Модели хранятся в AppData. Удаление EXE не удалит эти файлы.' : 'Models are stored in AppData. Deleting the EXE does not remove these files.'}</p></div><Button variant="ghost" aria-label={ru ? 'Открыть папку' : 'Open folder'} onClick={() => run('open-folder', () => api.openAppDataDir())}><FolderOpen size={17} /></Button></section>
    {confirmation ? <Modal label={confirmation.action === 'download' ? ru ? 'Скачать модель?' : 'Download model?' : ru ? 'Удалить модель?' : 'Delete model?'} onClose={() => setConfirmation(null)}><h3>{confirmation.action === 'download' ? ru ? 'Скачать модель?' : 'Download model?' : ru ? 'Удалить модель?' : 'Delete model?'}</h3><p>{confirmation.model.name} · {formatModelSize(confirmation.model.size_mb, locale)}</p><code className="data-settings__path">{data.path}</code>{modelNotice(confirmation.model) ? <Button variant="ghost" size="compact" onClick={() => void openExternalUrl(modelNotice(confirmation.model)!.url)}>{ru ? 'Условия модели' : 'Model terms'} · {modelNotice(confirmation.model)!.license}</Button> : null}<p>{confirmation.action === 'download' ? ru ? 'Модели хранятся в AppData. Удаление EXE не удалит эти файлы.' : 'Models are stored in AppData. Deleting the EXE does not remove these files.' : ru ? 'Записи и настройки сохранятся. Файл модели будет удалён из Music Island.' : 'Recordings and settings will remain. The model file will be removed from Music Island.'}</p><div className="dictation-dialog__actions"><Button onClick={() => setConfirmation(null)}>{ru ? 'Отмена' : 'Cancel'}</Button><Button variant={confirmation.action === 'delete' ? 'danger' : 'primary'} onClick={() => modelAction(confirmation.model, confirmation.action)}>{confirmation.action === 'download' ? ru ? 'Скачать' : 'Download' : ru ? 'Удалить' : 'Delete'}</Button></div></Modal> : null}
    {details ? <Modal label={details.name} onClose={() => setDetails(null)}><h3>{details.name}</h3><p>{modelLanguages(details, locale)} · {formatModelSize(details.size_mb, locale)}</p><p>{details.supports_translation ? ru ? 'Поддерживает перевод речи на английский.' : 'Supports speech translation into English.' : ru ? 'Распознаёт речь на компьютере.' : 'Recognizes speech on your computer.'}</p><p>{ru ? 'Лицензия модели' : 'Model license'}: {modelNotice(details)?.license ?? (ru ? 'указана автором модели' : 'provided by the model author')}</p>{modelNotice(details) ? <Button onClick={() => void openExternalUrl(modelNotice(details)!.url)}>{ru ? 'Модель и условия использования' : 'Model and terms of use'}</Button> : null}<div className="dictation-dialog__actions"><Button onClick={() => setDetails(null)}>{ru ? 'Закрыть' : 'Close'}</Button></div></Modal> : null}
    <Modal open={custom} label={ru ? 'Добавить файл модели' : 'Add a model file'} onClose={() => { if (c.busy !== 'custom-model') setCustom(false) }}><h3>{ru ? 'Добавить файл модели' : 'Add a model file'}</h3><p>{ru ? 'Укажите путь к GGUF или BIN. Файл будет скопирован в Music Island.' : 'Enter the path to a GGUF or BIN file. It will be copied to Music Island.'}</p><form onSubmit={async event => { event.preventDefault(); setCustomError(''); try { await c.run('custom-model', () => api.importCustomModel(path.trim())); setCustom(false); setPath('') } catch (reason) { setCustomError(String(reason)) } }}><Input aria-label={ru ? 'Путь к модели' : 'Model path'} value={path} onChange={event => setPath(event.target.value)} style={{ width: '100%' }} />{customError ? <p role="alert">{customError}</p> : null}<div className="dictation-dialog__actions"><Button disabled={c.busy === 'custom-model'} onClick={() => setCustom(false)}>{ru ? 'Отмена' : 'Cancel'}</Button><Button variant="primary" type="submit" disabled={!path.trim() || c.busy === 'custom-model'}>{c.busy === 'custom-model' ? ru ? 'Копирование…' : 'Copying…' : ru ? 'Скопировать' : 'Copy model'}</Button></div></form></Modal>
  </>
}
