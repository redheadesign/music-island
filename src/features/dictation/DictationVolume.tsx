import { useRef, useState } from 'react'
import { RangeSlider } from '../../shared/ui/RangeSlider'
import { SettingsIconButton } from '../../shared/ui/SettingsControls'
import { Volume2 } from '../../shared/ui/SettingsIcons'
import { CommitInput } from './DictationFields'

export function DictationVolume({ value, onSave, onTest, busy, locale }: { value: number; onSave: (value: number) => Promise<unknown>; onTest: () => Promise<unknown>; busy: boolean; locale: 'ru' | 'en' }) {
  const [draft, setDraft] = useState<number | null>(null)
  const [testing, setTesting] = useState(false)
  const pending = useRef<Promise<unknown>>(Promise.resolve())
  const current = draft ?? value
  const commit = (next: number) => {
    setDraft(null)
    const saving = pending.current.catch(() => {}).then(() => onSave(next))
    pending.current = saving
    void saving.catch(() => {}).finally(() => { if (pending.current === saving) pending.current = Promise.resolve() })
  }
  const test = async () => {
    setTesting(true)
    try { await pending.current; await onTest() } catch { /* Controller exposes the actionable error. */ }
    finally { setTesting(false) }
  }
  return <div className="dictation-volume"><RangeSlider aria-label={locale === 'ru' ? 'Громкость сигналов' : 'Sound volume'} min={0} max={100} step={1} value={current} onChange={event => setDraft(Number(event.currentTarget.value))} onPointerUp={event => commit(Number(event.currentTarget.value))} onKeyUp={event => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)) commit(Number(event.currentTarget.value)) }} onBlur={() => { if (draft !== null) commit(draft) }} />
    <div className="dictation-number"><CommitInput aria-label={locale === 'ru' ? 'Громкость в процентах' : 'Volume percent'} type="number" min={0} max={100} value={String(current)} onSave={next => commit(Number(next))} /><span>%</span></div>
    <SettingsIconButton label={locale === 'ru' ? 'Прослушать сигнал' : 'Test sound'} busy={busy || testing} onClick={() => void test()}><Volume2 size={18} /></SettingsIconButton>
  </div>
}
