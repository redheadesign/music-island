import { Button, Notice, Textarea } from '../../shared/ui/SettingsControls'
import type { Locale } from '../../shared/lib/types'
import type { useDictionaryDraft } from './useDictionaryDraft'

export function DictionaryWordField({ field, label, locale }: {
  field: ReturnType<typeof useDictionaryDraft>; label: string; locale: Locale
}) {
  const ru = locale === 'ru'
  return <><Textarea rows={6} aria-label={label} value={field.value} onChange={event => field.edit(event.target.value)} onBlur={field.save} />
    {field.failed ? <Notice tone="danger" action={<Button onClick={field.save}>{ru ? 'Повторить' : 'Retry'}</Button>}>
      {ru ? 'Не удалось сохранить изменения.' : 'Could not save your changes.'}
    </Notice> : null}</>
}
