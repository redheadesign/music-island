import { useDictationAction } from '../../app/useIslandApp'
import { IslandActionButton } from '../../shared/ui/IslandActionButton'
export function DictationMicrophone({ enabled, locale }: { enabled: boolean; locale: 'ru' | 'en' }) {
  const { recording, error, toggle } = useDictationAction(enabled)
  const label = !enabled ? locale === 'ru' ? 'Включите диктовку в настройках' : 'Enable dictation in Settings' : recording ? locale === 'ru' ? 'Завершить диктовку' : 'Finish dictation' : locale === 'ru' ? 'Начать диктовку' : 'Start dictation'
  return <IslandActionButton action="microphone" label={label} title={error ?? label}
    active={recording} disabled={!enabled} onPointerDown={event => event.preventDefault()} onClick={() => void toggle()} />
}
