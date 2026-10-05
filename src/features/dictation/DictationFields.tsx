import { useEffect, useState, type ReactNode, type InputHTMLAttributes } from 'react'
import { Input, Textarea, SettingRow, Switch } from '../../shared/ui/SettingsControls'

export function DictationField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <SettingRow label={label} hint={hint}>{children}</SettingRow>
}
export function DictationToggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <Switch label={label} hint={hint} checked={checked} onChange={onChange} />
}
export function CommitInput({ value, onSave, multiline, type = 'text', ...props }: { value: string; onSave: (value: string) => void; multiline?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const save = () => {
    if (type === 'number' && (!draft.trim() || !Number.isFinite(Number(draft)))) { setDraft(value); return }
    const increment = Number(props.step ?? 1)
    const base = Number(props.min ?? 0)
    const numeric = increment > 0 ? base + Math.round((Number(draft) - base) / increment) * increment : Number(draft)
    const next = type === 'number' ? String(Math.max(Number(props.min ?? -Infinity), Math.min(Number(props.max ?? Infinity), numeric))) : draft
    setDraft(next)
    if (next !== value) onSave(next)
  }
  return multiline ? <Textarea aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']} aria-describedby={props['aria-describedby']} value={draft} rows={6} onChange={(event) => setDraft(event.target.value)} onBlur={save} /> : <Input {...props} type={type} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={save} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setDraft(value) } if (event.key === 'Enter') event.currentTarget.blur() }} />
}
