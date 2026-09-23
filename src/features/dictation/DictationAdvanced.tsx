import { Select } from '../../shared/ui/Select'
import { Button } from '../../shared/ui/SettingsControls'
import { useEffect, useState } from 'react'
import type { DictationController } from '../../app/useIslandApp'
import type { AppSettings, AudioDevice, AvailableAccelerators } from '../../shared/lib/dictationTypes'
import { CommitInput, DictationField, DictationToggle } from './DictationFields'

export function DictationAdvanced({ controller: c, locale }: { controller: DictationController; locale: 'ru' | 'en' }) {
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [compute, setCompute] = useState<AvailableAccelerators | null>(null)
  const [diagnostic, setDiagnostic] = useState('')
  const t = (ru: string, en: string) => locale === 'ru' ? ru : en
  const { api, data } = c
  useEffect(() => {
    let alive = true
    void Promise.all([api.getAvailableOutputDevices(), api.getAvailableAccelerators()]).then(([outputs, accelerators]) => { if (alive) { setDevices(outputs); setCompute(accelerators) } }).catch(() => {})
    return () => { alive = false }
  }, [api])
  if (!data) return null
  const s = data.settings
  const run = (id: string, action: () => Promise<unknown>) => { void c.run(id, action).catch(() => {}) }
  const toggle = (label: string, field: keyof AppSettings, action: (value: boolean) => Promise<unknown>, hint?: string) => <DictationToggle label={label} hint={hint} checked={Boolean(s[field])} onChange={(value) => run(String(field), () => action(value))} />
  const select = (label: string, value: string, options: [string, string][], action: (value: string) => Promise<unknown>) => <DictationField label={label}><Select ariaLabel={label} value={value} onChange={(next) => run(label, () => action(next))} options={options.map(([value, label]) => ({ value, label }))} /></DictationField>
  const number = (label: string, value: number, min: number, max: number, action: (value: number) => Promise<unknown>) => <DictationField label={label}><CommitInput type="number" value={String(value)} onSave={(value) => { const next = Number(value); if (Number.isFinite(next)) run(label, () => action(Math.min(max, Math.max(min, next)))) }} /></DictationField>
  return <>
    <section className="dictation-card"><h3>{t('Звук и запись', 'Sound and recording')}</h3>
      {select(t('Устройство для сигналов', 'Sound output'), s.selected_output_device ?? 'default', [['default', t('Системное', 'System default')], ...devices.map((d): [string, string] => [d.name, d.name])], api.setSelectedOutputDevice)}
      {select(t('Звуки', 'Sounds'), s.sound_theme ?? 'marimba', [['marimba', 'Marimba'], ['pop', 'Pop'], ['custom', t('Свои звуки', 'Custom sounds')]], api.changeSoundThemeSetting)}
      {number(t('Громкость сигналов · 0–100%', 'Sound volume · 0–100%'), Math.round((s.audio_feedback_volume ?? 1) * 100), 0, 100, (value) => api.changeAudioFeedbackVolumeSetting(value / 100))}
      <Button type="button" onClick={() => run('sound-test', () => api.playTestSound('start'))}>{t('Прослушать сигнал', 'Test sound')}</Button>
      {s.sound_theme === 'custom' ? <p>{t('Положите custom_start.wav и custom_stop.wav в хранилище диктовки.', 'Put custom_start.wav and custom_stop.wav in dictation storage.')}</p> : null}
      {number(t('Порог удержания · мс', 'Hold threshold · ms'), s.hold_threshold_ms ?? 200, 100, 2000, api.changeHoldThresholdMsSetting)}
      {number(t('Буфер после отпускания · мс', 'Recording tail · ms'), s.extra_recording_buffer_ms ?? 0, 0, 2000, api.changeExtraRecordingBufferSetting)}
      {toggle(t('Закрывать микрофон с задержкой', 'Delay microphone close'), 'lazy_stream_close', api.changeLazyStreamCloseSetting)}
      {select(t('Плашка диктовки', 'Dictation overlay'), s.overlay_style ?? 'minimal', [['minimal', t('Компактная', 'Compact')], ['live', t('С текстом', 'With live text')], ['none', t('Скрыта', 'Hidden')]], api.changeOverlayStyleSetting)}
    </section>
    <section className="dictation-card"><h3>{t('Вычисления', 'Compute')}</h3>
      {compute ? select(t('Движок GGML / GGUF', 'GGML / GGUF engine'), s.transcribe_accelerator ?? 'auto', compute.transcribe.map((id): [string, string] => [id, id === 'auto' ? t('Автоматически', 'Automatic') : id.toUpperCase()]), (value) => api.changeTranscribeAcceleratorSetting(value as NonNullable<AppSettings['transcribe_accelerator']>)) : null}
      {compute?.gpu_devices.length ? select(t('Видеокарта', 'GPU'), s.transcribe_gpu_device ?? '', [['', t('Автоматически', 'Automatic')], ...compute.gpu_devices.map((d): [string, string] => [d.id, `${d.name} · ${d.total_vram_mb} MB`])], (value) => api.changeTranscribeGpuDevice(value || null)) : null}
      <p>{t('Модели ONNX используют CPU. Доступность GPU для GGML / GGUF зависит от оборудования и драйвера Vulkan.', 'ONNX models use the CPU. GPU availability for GGML / GGUF depends on your hardware and Vulkan driver.')}</p>
    </section>
    <section className="dictation-card"><h3>{t('Совместимость Windows', 'Windows compatibility')}</h3>
      {select(t('Обработчик сочетаний', 'Shortcut implementation'), s.keyboard_implementation ?? 'handy_keys', [['handy_keys', 'Handy Keys'], ['tauri', 'Tauri']], api.changeKeyboardImplementationSetting)}
      {number(t('Задержка перед вставкой · мс', 'Delay before paste · ms'), s.paste_delay_ms ?? 0, 0, 5000, api.changePasteDelayMsSetting)}
      {number(t('Задержка восстановления буфера · мс', 'Clipboard restore delay · ms'), s.paste_delay_after_ms ?? 0, 0, 5000, api.changePasteDelayAfterMsSetting)}
      {s.auto_submit ? select(t('Сочетание отправки', 'Submit key'), s.auto_submit_key ?? 'enter', [['enter', 'Enter'], ['ctrl_enter', 'Ctrl+Enter']], api.changeAutoSubmitKeySetting) : null}
      {s.experimental_enabled ? select(t('Детектор речи · эксперимент', 'Speech detector · experimental'), s.vad_backend ?? 'silero', [['silero', 'Silero'], ['earshot', 'Earshot']], (value) => api.changeVadBackendSetting(value as NonNullable<AppSettings['vad_backend']>)) : null}
      {toggle(t('Отладочные сообщения', 'Debug logging'), 'debug_mode', api.changeDebugModeSetting)}
      {select(t('Уровень журналов', 'Log level'), s.log_level ?? 'warn', ['error', 'warn', 'info', 'debug', 'trace'].map((level) => [level, level]), (value) => api.setLogLevel(value as NonNullable<AppSettings['log_level']>))}
      <Button type="button" onClick={() => run('logs', () => api.openLogDir())}>{t('Открыть журналы', 'Open logs')}</Button>
      <Button type="button" onClick={() => run('diagnose-mic', async () => { const result = await api.getWindowsMicrophonePermissionStatus(); setDiagnostic(Object.entries(result).map(([key, value]) => `${key}: ${value}`).join('\n')) })}>{t('Проверить доступ к микрофону', 'Check microphone access')}</Button>
      {diagnostic ? <pre role="status">{diagnostic}</pre> : null}
    </section>
  </>
}
