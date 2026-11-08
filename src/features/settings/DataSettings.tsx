import { Notice, Button } from '../../shared/ui/SettingsControls'
import { useState } from 'react'
import { FolderOpen, Trash2 } from '../../shared/ui/SettingsIcons'
import { useDataController } from '../../app/useIslandApp'
import { Modal } from '../../shared/ui/Modal'
export function DataSettings({ active, locale }: { active: boolean; locale: 'ru' | 'en' }) {
  const c = useDataController(active)
  const [confirmation, setConfirmation] = useState<'models' | 'history' | 'all' | null>(null)
  const ru = locale === 'ru'
  const size = (bytes: number) => new Intl.NumberFormat(locale, { style: 'unit', unit: bytes >= 1024 ** 3 ? 'gigabyte' : 'megabyte', maximumFractionDigits: 1 }).format(bytes / (bytes >= 1024 ** 3 ? 1024 ** 3 : 1024 ** 2))
  const labels = { models: ru ? 'Модели диктовки' : 'Dictation models', history: ru ? 'История и записи' : 'History and recordings', all: ru ? 'Все данные' : 'All data' }
  return <div className="dictation-page">
    {c.data ? <><div className="data-settings__sizes"><span>{labels.models}<strong>{size(c.data.models)}</strong></span><span>{labels.history}<strong>{size(c.data.history)}</strong></span><span>{ru ? 'Движок диктовки' : 'Dictation runtime'}<strong>{size(c.data.runtime)}</strong></span></div><Button type="button" variant="secondary" onClick={() => void c.open()}><FolderOpen size={16} />{ru ? 'Открыть папку' : 'Open folder'}</Button><div className="data-settings__actions">{(['models', 'history', 'all'] as const).map((kind) => <Button key={kind} type="button" disabled={c.busy} onClick={() => setConfirmation(kind)}><Trash2 size={15} />{kind === 'models' ? ru ? 'Удалить модели' : 'Delete models' : kind === 'history' ? ru ? 'Очистить историю' : 'Clear history' : ru ? 'Удалить все данные и выйти' : 'Delete all data and exit'}</Button>)}</div></> : <p>{ru ? 'Подсчёт…' : 'Calculating…'}</p>}
    {c.error ? <Notice tone="danger">{c.error}</Notice> : null}
    <Modal open={Boolean(confirmation)} onClose={() => setConfirmation(null)} label={ru ? 'Удаление данных' : 'Delete data'}>
      {confirmation && c.data ? <><h3>{labels[confirmation]}</h3><p>{size(confirmation === 'all' ? c.data.total : c.data[confirmation])}</p>{confirmation === 'all' ? <><p>{ru ? 'Запись и загрузки остановятся. Настройки, модели, история и кэш удалятся:' : 'Recording and downloads will stop. Settings, models, history and cache will be deleted:'}</p>{c.data.folders.map((folder) => <code className="data-settings__path" key={folder.path}>{folder.path}</code>)}<p>{ru ? 'Handy, общий кэш Hugging Face и EXE сохранятся.' : 'Handy, the shared Hugging Face cache and the EXE stay.'}</p></> : <p>{ru ? 'Это действие нельзя отменить.' : 'This cannot be undone.'}</p>}<div className="data-settings__actions"><Button type="button" onClick={() => setConfirmation(null)}>{ru ? 'Отмена' : 'Cancel'}</Button><Button variant="danger" type="button" onClick={() => { const kind = confirmation; setConfirmation(null); void c.remove(kind) }}>{confirmation === 'all' ? ru ? 'Удалить и выйти' : 'Delete and exit' : ru ? 'Удалить' : 'Delete'}</Button></div></> : null}
    </Modal>
  </div>
}
