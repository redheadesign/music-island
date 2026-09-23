import { Mic, Square } from 'lucide-react'
import { useDictationAction } from '../../app/useIslandApp'
export function DictationMicrophone({ enabled, locale }: { enabled: boolean; locale: 'ru' | 'en' }) {
  const { recording, error, toggle } = useDictationAction(enabled)
  const label = !enabled ? locale === 'ru' ? 'Включите диктовку в настройках' : 'Enable dictation in Settings' : recording ? locale === 'ru' ? 'Завершить диктовку' : 'Finish dictation' : locale === 'ru' ? 'Начать диктовку' : 'Start dictation'
  return <button type="button" className="icon-button" aria-label={label} title={error ?? label} aria-pressed={recording} disabled={!enabled} onPointerDown={(event) => event.preventDefault()} onClick={() => void toggle()}>{recording ? <Square size={14} fill="currentColor" /> : <Mic size={16} />}</button>
}
