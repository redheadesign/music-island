import { useEffect, useState, type ReactNode } from 'react'
import { Input, Textarea, SettingRow, Switch } from '../../shared/ui/SettingsControls'

export function DictationField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <SettingRow label={label} hint={hint}>{children}</SettingRow>
}
export function DictationToggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <Switch label={label} hint={hint} checked={checked} onChange={onChange} />
}
export function CommitInput({ value, onSave, multiline, type = 'text' }: { value: string; onSave: (value: string) => void; multiline?: boolean; type?: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return multiline ? <Textarea value={draft} rows={6} onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (draft !== value) onSave(draft) }} /> : <Input type={type} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => { if (draft !== value) onSave(draft) }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
}
