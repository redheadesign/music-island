import { Button, Input } from '../../shared/ui/SettingsControls'
import { useState } from 'react'
import { FolderInput } from '../../shared/ui/SettingsIcons'
import { Modal } from '../../shared/ui/Modal'
import type { DictationController } from '../../app/useIslandApp'
import type { HandyImportPreview } from '../../shared/lib/dataTypes'
export function HandyImport({ controller, locale }: { controller: DictationController; locale: 'ru' | 'en' }) {
  const [preview, setPreview] = useState<HandyImportPreview | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [settings, setSettings] = useState(false)
  const [operation, setOperation] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ru = locale === 'ru'
  const size = (bytes: number) => `${(bytes / 1024 ** 3).toLocaleString(locale, { maximumFractionDigits: 2 })} ${ru ? 'ГБ' : 'GB'}`
  const total = preview?.items.filter((item) => selected.includes(item.id)).reduce((sum, item) => sum + item.bytes, 0) ?? 0
  return <><Button variant="ghost" size="compact" type="button" onClick={() => { setError(null); void controller.api.previewHandyImport().then((result) => { setPreview(result); setSelected([]); setSettings(false) }).catch((reason) => setError(String(reason))) }}><FolderInput size={16} />{ru ? 'Импорт из Handy' : 'Import from Handy'}</Button>{error ? <p role="alert">{error}</p> : null}
    <Modal open={Boolean(preview)} onClose={() => { if (!operation) setPreview(null) }} label={ru ? 'Импорт из Handy' : 'Import from Handy'}>
      <h3>{ru ? 'Выберите, что перенести' : 'Choose what to import'}</h3><p>{ru ? 'Выбранные файлы будут скопированы в хранилище Music Island. Исходные файлы останутся на месте.' : 'Selected files will be copied to Music Island storage. The originals will stay in place.'}</p>
      <div className="dictation-import__items">{preview?.items.map((item) => <label key={item.id}><Input type="checkbox" disabled={Boolean(operation) || item.exists} checked={selected.includes(item.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} /><span>{item.name}<small>{item.exists ? ru ? 'Уже в Music Island' : 'Already in Music Island' : size(item.bytes)}</small></span></label>)}</div>
      {!preview?.items.length ? <p>{ru ? 'Модели Handy не найдены.' : 'No Handy models found.'}</p> : null}
      {preview?.settings.length ? <label className="dictation-import__settings"><Input type="checkbox" checked={settings} disabled={Boolean(operation)} onChange={(event) => setSettings(event.target.checked)} />{ru ? 'Перенести настройки диктовки и словарь' : 'Import dictation settings and dictionary'}</label> : null}
      <p>{ru ? 'История и ключи сервисов не переносятся. Обработка текста в облаке остаётся выключенной, если вы не включали её в Music Island.' : 'History and service keys are not imported. Cloud processing stays off unless you have enabled it in Music Island.'}</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="dictation-dialog__actions"><Button type="button" onClick={() => operation ? void controller.api.cancelImport(operation) : setPreview(null)}>{ru ? 'Отмена' : 'Cancel'}</Button><Button type="button" disabled={Boolean(operation) || (!selected.length && !settings)} onClick={async () => { const id = crypto.randomUUID(); setOperation(id); setError(null); try { await controller.api.importHandy(id, selected, settings); await controller.refresh(); setPreview(null) } catch (reason) { setError(String(reason)) } finally { setOperation(null) } }}>{operation ? ru ? 'Копирование…' : 'Copying…' : `${ru ? 'Скопировать' : 'Copy'} · ${size(total)}`}</Button></div>
    </Modal>
  </>
}
