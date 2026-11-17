import { useState } from 'react'
import { Modal } from '../../shared/ui/Modal'
import { Button, Notice } from '../../shared/ui/SettingsControls'
import type { Locale } from '../../shared/lib/types'

export function DictationDeleteDialog({ title, detail, locale, onClose, onDelete }: {
  title: string; detail: string; locale: Locale; onClose: () => void; onDelete: () => Promise<unknown>
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const close = () => { if (!busy) onClose() }
  const remove = async () => {
    if (busy) return
    setBusy(true); setFailed(false)
    try { await onDelete(); onClose() }
    catch { setFailed(true); setBusy(false) }
  }
  return <Modal label={title} onClose={close}>
    <h3>{title}</h3><p>{detail}</p>
    {failed ? <Notice tone="danger">{locale === 'ru' ? 'Не удалось удалить. Попробуйте ещё раз.' : 'Could not delete. Try again.'}</Notice> : null}
    <div className="dictation-dialog__actions">
      <Button autoFocus disabled={busy} onClick={close}>{locale === 'ru' ? 'Отмена' : 'Cancel'}</Button>
      <Button variant="danger" disabled={busy} onClick={() => void remove()}>{locale === 'ru' ? 'Удалить' : 'Delete'}</Button>
    </div>
  </Modal>
}
