import { Notice, Button, SettingsIconButton } from '../../shared/ui/SettingsControls'
import { RotateCcw } from '../../shared/ui/SettingsIcons'
import { useDictationShortcut, type DictationController } from '../../app/useIslandApp'
export function DictationShortcut({ controller, id, locale }: { controller: DictationController; id: string; locale: 'ru' | 'en' }) {
  const capture = useDictationShortcut(controller, id)
  const ru = locale === 'ru'
  const binding = controller.data?.settings.bindings?.[id]?.current_binding ?? ''
  return <div className="dictation-shortcut">
    <Button type="button" aria-pressed={capture.recording} onClick={() => { if (!capture.recording) void capture.start() }} onBlur={capture.cancel}>{capture.recording ? capture.keys || (ru ? 'Нажмите сочетание…' : 'Press a shortcut…') : binding || (ru ? 'Задать сочетание' : 'Set shortcut')}</Button>
    {capture.recording ? <Button type="button" onClick={capture.cancel}>{ru ? 'Отмена' : 'Cancel'}</Button> : <SettingsIconButton label={ru ? 'Сбросить сочетание' : 'Reset shortcut'} onClick={() => {
      void controller.run(`binding:${id}`, async () => {
        const result = await controller.api.resetBinding(id)
        if (!result.success) throw new Error(result.error ?? '')
      }).catch(() => {})
    }}><RotateCcw size={16} /></SettingsIconButton>}
    {capture.error ? <Notice tone="danger">{capture.error}</Notice> : null}
  </div>
}
