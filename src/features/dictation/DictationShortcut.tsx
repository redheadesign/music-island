import { Button } from '../../shared/ui/SettingsControls'
import { useDictationShortcut, type DictationController } from '../../app/useIslandApp'
import { CommitInput } from './DictationFields'
export function DictationShortcut({ controller, id, locale }: { controller: DictationController; id: string; locale: 'ru' | 'en' }) {
  const capture = useDictationShortcut(controller, id)
  const ru = locale === 'ru'
  const binding = controller.data?.settings.bindings?.[id]?.current_binding ?? ''
  const native = controller.data?.settings.keyboard_implementation !== 'tauri'
  const save = (value: string) => { void controller.run(`binding:${id}`, async () => { const result = await controller.api.changeBinding(id, value); if (!result.success) throw new Error(result.error ?? '') }).catch(() => {}) }
  return <span className="dictation-shortcut">
    {native ? <Button type="button" aria-pressed={capture.recording} onClick={() => { if (!capture.recording) void capture.start() }} onBlur={capture.cancel}>{capture.recording ? capture.keys || (ru ? 'Нажмите сочетание…' : 'Press a shortcut…') : binding || (ru ? 'Задать сочетание' : 'Set shortcut')}</Button> : <CommitInput value={binding} onSave={save} />}
    {capture.recording ? <Button type="button" onClick={capture.cancel}>{ru ? 'Отмена' : 'Cancel'}</Button> : <Button type="button" aria-label={ru ? 'Сбросить сочетание' : 'Reset shortcut'} onClick={() => {
      void controller.run(`binding:${id}`, async () => {
        const result = await controller.api.resetBinding(id)
        if (!result.success) throw new Error(result.error ?? '')
      }).catch(() => {})
    }}>↺</Button>}
    {capture.error ? <small role="alert">{capture.error}</small> : null}
  </span>
}
