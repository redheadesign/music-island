import { DictationVolume } from './DictationVolume'
import { Select } from '../../shared/ui/Select'
import { Button, Notice } from '../../shared/ui/SettingsControls'
import { useEffect, useState } from 'react'
import type { DictationController } from '../../app/useIslandApp'
import type { AppSettings, AudioDevice, AvailableAccelerators, WindowsMicrophonePermissionStatus } from '../../shared/lib/dictationTypes'
import { CommitInput, DictationField, DictationToggle } from './DictationFields'

export function DictationAdvanced({ controller: c, locale }: { controller: DictationController; locale: 'ru' | 'en' }) {
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [compute, setCompute] = useState<AvailableAccelerators | null>(null)
  const [diagnostic, setDiagnostic] = useState<WindowsMicrophonePermissionStatus | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const t = (ru: string, en: string) => locale === 'ru' ? ru : en
  const { api, data } = c
  useEffect(() => {
    let alive = true
    setLoading(true); setLoadError(false)
    void Promise.allSettled([api.getAvailableOutputDevices(), api.getAvailableAccelerators()]).then(([outputs, accelerators]) => {
      if (!alive) return
      if (outputs.status === 'fulfilled') setDevices(outputs.value)
      if (accelerators.status === 'fulfilled') setCompute(accelerators.value)
      setLoadError(outputs.status === 'rejected' || accelerators.status === 'rejected'); setLoading(false)
    })
    return () => { alive = false }
  }, [api, retry])
  if (!data) return null
  const s = data.settings
  const run = (id: string, action: () => Promise<unknown>) => { void c.run(id, action).catch(() => {}) }
  const toggle = (label: string, field: keyof AppSettings, action: (value: boolean) => Promise<unknown>, hint?: string) => <DictationToggle label={label} hint={hint} checked={Boolean(s[field])} onChange={(value) => run(String(field), () => action(value))} />
  const select = (label: string, value: string, options: [string, string][], action: (value: string) => Promise<unknown>) => <DictationField label={label}><Select ariaLabel={label} value={value} onChange={(next) => run(label, () => action(next))} options={options.map(([value, label]) => ({ value, label }))} /></DictationField>
  const number = (label: string, value: number, min: number, max: number, action: (value: number) => Promise<unknown>) => <DictationField label={label}><div className="dictation-number"><CommitInput aria-label={label} type="number" min={min} max={max} step={1} value={String(value)} onSave={next => run(label, () => action(Number(next)))} /><span>{t('мс', 'ms')}</span></div></DictationField>
  return <>
    {loading ? <Notice>{t('Загружаем устройства…', 'Loading devices…')}</Notice> : null}
    {loadError ? <Notice tone="danger" action={<Button size="compact" onClick={() => setRetry(value => value + 1)}>{t('Повторить', 'Retry')}</Button>}>{t('Не удалось получить устройства или ускорители.', 'Could not load devices or accelerators.')}</Notice> : null}
    <section className="dictation-card"><h3>{t('Звуковые сигналы', 'Sound feedback')}</h3>{toggle(t('Звуки начала и конца', 'Start and stop sounds'), 'audio_feedback', api.changeAudioFeedbackSetting)}
      {select(t('Устройство для сигналов', 'Sound output'), s.selected_output_device ?? 'default', [['default', t('Системное', 'System default')], ...devices.map((d): [string, string] => [d.name, d.name])], api.setSelectedOutputDevice)}
      {select(t('Звуки', 'Sounds'), s.sound_theme ?? 'marimba', [['marimba', 'Marimba'], ['pop', 'Pop'], ['custom', t('Свои звуки', 'Custom sounds')]], api.changeSoundThemeSetting)}
      <DictationField label={t('Громкость', 'Volume')}><DictationVolume locale={locale} value={Math.round((s.audio_feedback_volume ?? 1) * 100)} onSave={value => c.run('sound-volume', () => api.changeAudioFeedbackVolumeSetting(value / 100))} onTest={() => c.run('sound-test', () => api.playTestSound('start'))} busy={Boolean(c.busy)} /></DictationField>
      {s.sound_theme === 'custom' ? <p>{t('Положите custom_start.wav и custom_stop.wav в хранилище диктовки.', 'Put custom_start.wav and custom_stop.wav in dictation storage.')}</p> : null}
    </section>
      <section className="dictation-card"><h3>{t('Запись', 'Recording')}</h3>{toggle(t('Определять речь', 'Detect speech'), 'vad_enabled', api.changeVadEnabledSetting)}{toggle(t('Приглушать звук при записи', 'Mute playback while recording'), 'mute_while_recording', api.changeMuteWhileRecordingSetting)}{toggle(t('Держать микрофон открытым', 'Keep microphone open'), 'always_on_microphone', api.updateMicrophoneMode, t('По умолчанию микрофон работает только во время записи.', 'By default, the microphone is opened only while recording.'))}{select(t('Выгружать модель через', 'Unload model after'), s.model_unload_timeout ?? 'min5', [['immediately', t('Сразу', 'Immediately')], ['min2', t('2 минуты', '2 minutes')], ['min5', t('5 минут', '5 minutes')], ['min10', t('10 минут', '10 minutes')], ['min15', t('15 минут', '15 minutes')], ['hour1', t('1 час', '1 hour')], ['never', t('Не выгружать', 'Never')]], (value) => api.setModelUnloadTimeout(value as NonNullable<AppSettings['model_unload_timeout']>))}      {number(t('Порог удержания', 'Hold threshold'), s.hold_threshold_ms ?? 200, 100, 2000, api.changeHoldThresholdMsSetting)}
      {number(t('Буфер после отпускания', 'Recording tail'), s.extra_recording_buffer_ms ?? 0, 0, 2000, api.changeExtraRecordingBufferSetting)}
      {toggle(t('Закрывать микрофон с задержкой', 'Delay microphone close'), 'lazy_stream_close', api.changeLazyStreamCloseSetting)}</section>
      <section className="dictation-card"><h3>{t('Вставка текста', 'Text insertion')}</h3>{select(t('Способ вставки', 'Paste method'), s.paste_method ?? 'ctrl_v', [['ctrl_v', 'Ctrl+V'], ['shift_insert', 'Shift+Insert'], ['ctrl_shift_v', 'Ctrl+Shift+V'], ['direct', t('Набор текста', 'Type text')], ['none', t('Только история', 'History only')], ['external_script', t('Внешняя программа', 'External program')]], api.changePasteMethodSetting)}{s.paste_method === 'external_script' ? <DictationField label={t('Путь к программе', 'Program path')} hint={t('Получает распознанный текст аргументом. Выберите свою программу для вставки.', 'Receives recognized text as an argument. Choose your own program to paste it.')}><CommitInput value={s.external_script_path ?? ''} onSave={(path) => run('external-script', () => api.changeExternalScriptPathSetting(path || null))} /></DictationField> : null}{select(t('Буфер обмена', 'Clipboard'), s.clipboard_handling ?? 'dont_modify', [['dont_modify', t('Восстанавливать', 'Restore')], ['copy_to_clipboard', t('Оставлять результат', 'Keep result')]], api.changeClipboardHandlingSetting)}{toggle(t('Убирать точку в конце', 'Remove trailing period'), 'remove_trailing_period', api.changeRemoveTrailingPeriodSetting, t('Убирает последнюю точку. Остальная пунктуация сохраняется.', 'Removes the final period. Other punctuation stays unchanged.'))}{toggle(t('Пробел после текста', 'Trailing space'), 'append_trailing_space', api.changeAppendTrailingSpaceSetting)}{toggle(t('Отправлять после вставки', 'Submit after pasting'), 'auto_submit', api.changeAutoSubmitSetting, t('Нажимает Enter в целевом приложении.', 'Presses Enter in the target app.'))}</section>
    <section className="dictation-card"><h3>{t('Вычисления', 'Compute')}</h3>
      {compute ? select(t('Движок GGML / GGUF', 'GGML / GGUF engine'), s.transcribe_accelerator ?? 'auto', compute.transcribe.map((id): [string, string] => [id, id === 'auto' ? t('Автоматически', 'Automatic') : id.toUpperCase()]), (value) => api.changeTranscribeAcceleratorSetting(value as NonNullable<AppSettings['transcribe_accelerator']>)) : null}
      {compute?.gpu_devices.length ? select(t('Видеокарта', 'GPU'), s.transcribe_gpu_device ?? '', [['', t('Автоматически', 'Automatic')], ...compute.gpu_devices.map((d): [string, string] => [d.id, `${d.name} · ${d.total_vram_mb} MB`])], (value) => api.changeTranscribeGpuDevice(value || null)) : null}
      <p>{t('Модели ONNX используют CPU. Доступность GPU для GGML / GGUF зависит от оборудования и драйвера Vulkan.', 'ONNX models use the CPU. GPU availability for GGML / GGUF depends on your hardware and Vulkan driver.')}</p>
    </section>
    <section className="dictation-card"><h3>{t('Совместимость Windows', 'Windows compatibility')}</h3>
      {select(t('Обработчик сочетаний', 'Shortcut implementation'), s.keyboard_implementation ?? 'handy_keys', [['handy_keys', 'Handy Keys'], ['tauri', 'Tauri']], api.changeKeyboardImplementationSetting)}
      {number(t('Задержка перед вставкой', 'Delay before paste'), s.paste_delay_ms ?? 0, 0, 5000, api.changePasteDelayMsSetting)}
      {number(t('Задержка восстановления буфера', 'Clipboard restore delay'), s.paste_delay_after_ms ?? 0, 0, 5000, api.changePasteDelayAfterMsSetting)}
      {s.auto_submit ? select(t('Сочетание отправки', 'Submit key'), s.auto_submit_key ?? 'enter', [['enter', 'Enter'], ['ctrl_enter', 'Ctrl+Enter']], api.changeAutoSubmitKeySetting) : null}
      {s.experimental_enabled ? select(t('Детектор речи · эксперимент', 'Speech detector · experimental'), s.vad_backend ?? 'silero', [['silero', 'Silero'], ['earshot', 'Earshot']], (value) => api.changeVadBackendSetting(value as NonNullable<AppSettings['vad_backend']>)) : null}

    </section>
      <section className="dictation-card"><h3>{t('Диагностика', 'Diagnostics')}</h3>{toggle(t('Экспериментальные функции', 'Experimental features'), 'experimental_enabled', api.changeExperimentalEnabledSetting)}{s.experimental_enabled ? toggle(t('Восстанавливать буфер после чтения · бета', 'Restore clipboard after read · beta'), 'reliable_paste', api.changeReliablePasteSetting) : null}      {toggle(t('Отладочные сообщения', 'Debug logging'), 'debug_mode', api.changeDebugModeSetting)}
      {select(t('Уровень журналов', 'Log level'), s.log_level ?? 'warn', ['error', 'warn', 'info', 'debug', 'trace'].map((level) => [level, level]), (value) => api.setLogLevel(value as NonNullable<AppSettings['log_level']>))}
      <div className="ui-action-row"><Button type="button" onClick={() => run('mic-privacy', () => api.openMicrophonePrivacySettings())}>{t('Доступ к микрофону в Windows', 'Windows microphone access')}</Button><Button type="button" disabled={!data.modelStatus?.is_loaded} onClick={() => run('unload', () => api.unloadModelManually())}>{t('Выгрузить модель сейчас', 'Unload model now')}</Button><Button type="button" onClick={() => run('logs', () => api.openLogDir())}>{t('Открыть журналы', 'Open logs')}</Button>
      <Button type="button" onClick={() => run('diagnose-mic', async () => { const result = await api.getWindowsMicrophonePermissionStatus(); setDiagnostic(result) })}>{t('Проверить микрофон', 'Check microphone')}</Button></div>
      {diagnostic ? <Notice tone={diagnostic.overall_access === 'allowed' ? 'success' : 'warning'} title={diagnostic.overall_access === 'allowed' ? t('Доступ к микрофону разрешён', 'Microphone access is allowed') : diagnostic.overall_access === 'denied' ? t('Windows запрещает доступ к микрофону', 'Windows is blocking microphone access') : t('Не удалось определить доступ к микрофону', 'Could not determine microphone access')}><details><summary>{t('Технические данные', 'Technical details')}</summary><pre>{JSON.stringify(diagnostic, null, 2)}</pre></details></Notice> : null}</section>
  </>
}
