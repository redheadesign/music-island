import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Mic, RotateCcw, Trash2 } from '../../shared/ui/SettingsIcons'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { DictationController } from '../../app/useIslandApp'
import { createTranslator } from '../../shared/i18n/messages'
import type { AppSettings, HistoryEntry } from '../../shared/lib/dictationTypes'
import { DictationPreview } from './DictationPreview'
import { DictationThemePicker } from './DictationThemePicker'
import { defaultDictationAppearance, type DictationAppearance } from '../../shared/lib/dictationAppearance'
import { DictationModels } from './DictationModels'
import { DictationAdvanced } from './DictationAdvanced'
import { DictationProcessing } from './DictationProcessing'
import { DictationShortcut } from './DictationShortcut'
import { dictationPages, type DictationPage } from './dictationPages'
import { Button, Notice, Input } from '../../shared/ui/SettingsControls'
import { Select } from '../../shared/ui/Select'
import { CommitInput, DictationField, DictationToggle } from './DictationFields'
import './dictation.css'

export function DictationSettings({ controller: c, page, locale, onEnable, onDisable, onPage, active = true, reducedMotion = false, appearance = defaultDictationAppearance, onAppearanceChange = () => {}, showLatestMessage = false, onShowLatestMessage }: {
  active?: boolean; reducedMotion?: boolean; controller: DictationController; page: DictationPage; locale: 'ru' | 'en'; onEnable: () => Promise<void>; onDisable?: () => Promise<void>; onPage: (page: DictationPage) => void
  appearance?: DictationAppearance; onAppearanceChange?: (value: DictationAppearance) => void
  showLatestMessage?: boolean; onShowLatestMessage?: (enabled: boolean) => void
}) {
  const translate = createTranslator(locale)
  const ru = locale === 'ru'
  const t = (a: string, b: string) => ru ? a : b
  const [channels, setChannels] = useState<number>(0)
  const [copied, setCopied] = useState<number | null>(null)
  const [historyAudio, setHistoryAudio] = useState<{ id: number; url: string } | null>(null)
  const { api, data } = c
  const model = data?.models.find(item => item.id === data.settings.selected_model)
  const languageOptions = useMemo(() => {
    if (!model?.supports_language_selection) return []
    const names = new Intl.DisplayNames([locale], { type: 'language' })
    return model.supported_languages.map((language): [string, string] => [language, names.of(language) ?? language])
  }, [model, locale])
  const run = (id: string, action: () => Promise<unknown>) => { void c.run(id, action).catch(() => undefined) }
  const microphone = data?.settings.selected_microphone
  const initialized = Boolean(data)
  useEffect(() => {
    if (!initialized || page !== 'general') return
    let active = true
    void api.getMicrophoneChannels(microphone ?? 'default').then((count) => { if (active) setChannels(count) }).catch(() => { if (active) setChannels(0) })
    return () => { active = false }
  }, [api, microphone, initialized, page])
  const error = c.error ? <Notice tone="danger" action={<Button onClick={() => run('refresh', () => c.refresh())}>{t('Повторить', 'Retry')}</Button>}>{c.error}</Notice> : null
  if (!data) return <div className="dictation-page"><h2 className="settings-page-heading">{t('Диктовка', 'Dictation')}</h2><section className="dictation-welcome"><span className="dictation-welcome__icon"><Mic size={30} /></span><h3>{t('Текст там, где курсор', 'Speak where you type')}</h3><p>{t('Распознавание на компьютере. Выберите модель и сочетание.', 'On-device recognition. Choose a model and shortcut.')}</p><Button type="button" variant="primary" disabled={Boolean(c.busy)} onClick={() => { void onEnable().then(() => onPage('models')).catch(() => undefined) }}>{c.busy ? t('Подготовка…', 'Preparing…') : t('Настроить диктовку', 'Set up dictation')}</Button></section>{error}</div>
  const s = data.settings
  const recording = data.status?.phase === 'recording' || data.status?.phase === 'streaming'
  const toggle = (label: string, field: keyof AppSettings, action: (checked: boolean) => Promise<unknown>, hint?: string) => <DictationToggle label={label} checked={Boolean(s[field])} hint={hint} onChange={(checked) => run(String(field), () => action(checked))} />
  const select = (label: string, value: string | number, options: [string, string][], action: (value: string) => Promise<unknown>, hint?: string) => <DictationField label={label} hint={hint}><Select ariaLabel={label} value={String(value)} onChange={(next) => run(label, () => action(next))} options={options.map(([value, label]) => ({ value, label }))} /></DictationField>
  return <div className="dictation-page" data-reduced-motion={reducedMotion || undefined} aria-busy={Boolean(c.busy)}>
    {page !== 'models' ? <h2 className="settings-page-heading">{dictationPages[page][ru ? 0 : 1]}</h2> : null}
    {error}
    {page === 'general' ? <>
<DictationPreview controller={c} locale={locale} active={active} reducedMotion={reducedMotion} appearance={appearance} onEnable={onEnable} onDisable={onDisable} />
<DictationThemePicker value={appearance} onChange={onAppearanceChange} locale={locale} />
<section className="dictation-card" aria-label={t('Сочетания клавиш', 'Keyboard shortcuts')}>
        <DictationField label={t('Сочетание клавиш', 'Keyboard shortcut')}><DictationShortcut controller={c} id="transcribe" locale={locale} /></DictationField>
        <DictationField label={t('Отмена записи', 'Cancel recording')}><DictationShortcut controller={c} id="cancel" locale={locale} /></DictationField>
        {select(t('Режим сочетания', 'Shortcut mode'), s.shortcut_activation ?? 'toggle', [['toggle', t('Нажать для старта и стопа', 'Press to start or stop')], ['push_to_talk', t('Удерживать', 'Hold to record')], ['hold_or_toggle', t('Удержание или переключение', 'Hold or toggle')]], (value) => api.changeShortcutActivationSetting(value as NonNullable<AppSettings['shortcut_activation']>))}
</section>
      <section className="dictation-card"><DictationField label={t('Модель', 'Model')} hint={model?.name ?? t('Выберите и скачайте модель.', 'Choose and download a model.')}><Button type="button" onClick={() => onPage('models')}>{t('Выбрать', 'Choose')}</Button></DictationField>
        {select(t('Микрофон', 'Microphone'), s.selected_microphone ?? 'default', [['default', t('Системный', 'System default')], ...data.microphones.map((device): [string, string] => [device.name, device.name])], api.setSelectedMicrophone, t('Можно выбрать вход Better Voice.', 'You can select the Better Voice input.'))}
        {channels > 1 ? select(t('Канал', 'Channel'), s.selected_channel ?? 'all', [['all', t('Все каналы', 'All channels')], ...Array.from({ length: channels }, (_, index): [string, string] => [String(index), String(index + 1)])], (value) => api.setSelectedChannel(value === 'all' ? null : Number(value))) : null}
        {model?.supports_language_selection ? select(t('Язык речи', 'Speech language'), s.selected_language ?? 'auto', [...(model.supports_language_detection ? [['auto', t('Определять', 'Detect')] as [string, string]] : []), ...languageOptions], api.changeSelectedLanguageSetting) : null}
        {model?.supports_translation ? toggle(t('Переводить на английский', 'Translate to English'), 'translate_to_english', api.changeTranslateToEnglishSetting) : null}
      </section>
      <section className="dictation-card"><h3>{t('Пробная запись', 'Test recording')}</h3><p>{t('Откройте поле ввода и нажмите сочетание.', 'Open a text field and press the shortcut.')}</p><Button type="button" variant="primary" disabled={!c.enabled || !model?.is_downloaded} onClick={() => run('try', () => api.toggle())}><Mic size={16} />{recording ? t('Закончить запись', 'Stop recording') : t('Начать запись', 'Start recording')}</Button><Button type="button" disabled={!c.enabled || !recording} onClick={() => run('cancel', () => api.cancelOperation())}>{t('Отменить запись', 'Cancel recording')}</Button></section>
    </> : null}
    {page === 'models' ? <DictationModels controller={c} locale={locale} /> : null}
    {page === 'history' ? <>
      <section className="dictation-history-settings">
        {select(t('Хранить записи', 'Keep recordings'), s.recording_retention_period ?? 'preserve_limit', [['never', t('Без срока', 'Keep indefinitely')], ['preserve_limit', t('В пределах истории', 'Within history limit')], ['days3', t('3 дня', '3 days')], ['weeks2', t('2 недели', '2 weeks')], ['months3', t('3 месяца', '3 months')]], (value) => api.updateRecordingRetentionPeriod(({ days3: 'days3', weeks2: 'weeks2', months3: 'months3' }[value] ?? value)))}<DictationField label={t('Размер истории', 'History limit')}><CommitInput type="number" min={1} max={10000} value={String(s.history_limit ?? 5)} onSave={(value) => run('history-limit', () => api.updateHistoryLimit(Math.max(1, Math.min(10000, Number(value)))))} /></DictationField>
        {onShowLatestMessage ? <div className="dictation-history-island-option">
          <DictationToggle label={translate('dictation.latestSetting')} hint={translate('dictation.latestHint')}
            checked={showLatestMessage} onChange={onShowLatestMessage} />
        </div> : null}
      </section>
      {data.history.length ? data.history.map((entry: HistoryEntry) => <article className="dictation-history" key={entry.id}><time dateTime={new Date(entry.timestamp * 1000).toISOString()}>{new Date(entry.timestamp * 1000).toLocaleString(locale)}</time><p>{entry.post_processed_text ?? entry.transcription_text}</p><div className="dictation-history__actions"><Button type="button" onClick={() => { setCopied(null); run(`copy-history:${entry.id}`, async () => { await navigator.clipboard.writeText(entry.post_processed_text ?? entry.transcription_text); setCopied(entry.id) }) }}>{copied === entry.id ? <Check size={15} /> : <Copy size={15} />}{t('Копировать', 'Copy')}</Button><Button type="button" disabled={!c.enabled} onClick={() => run(`retry:${entry.id}`, () => api.retryHistoryEntryTranscription(entry.id))}><RotateCcw size={15} />{t('Распознать снова', 'Transcribe again')}</Button><Button type="button" onClick={() => run('play-audio', async () => setHistoryAudio({ id: entry.id, url: convertFileSrc(await api.getAudioFilePath(entry.file_name)) }))}>{t('Аудио', 'Audio')}</Button><Button type="button" aria-pressed={entry.saved} onClick={() => run('save-history', () => api.toggleHistoryEntrySaved(entry.id))}>{entry.saved ? t('Сохранена', 'Saved') : t('Сохранить', 'Keep')}</Button><Button type="button" aria-label={t('Удалить запись', 'Delete entry')} onClick={() => run('delete-history', () => api.deleteHistoryEntry(entry.id))}><Trash2 size={15} /></Button></div>{historyAudio?.id === entry.id ? <audio controls src={historyAudio.url} /> : null}</article>) : <div className="dictation-empty"><Mic size={28} /><h3>{t('Записей пока нет', 'Your recordings appear here')}</h3><p>{t('Нажмите сочетание для записи.', 'Start dictating with your keyboard shortcut.')}</p></div>}
    </> : null}
    {page === 'history' && data.hasMoreHistory ? <Button type="button" onClick={() => run('more-history', c.loadMoreHistory)}>{t('Показать ещё', 'Load more')}</Button> : null}
    {page === 'dictionary' ? <section className="dictation-card"><h3>{t('Свои слова', 'Custom words')}</h3><p>{t('Каждое слово или фраза — с новой строки.', 'One word or phrase per line.')}</p><CommitInput multiline aria-label={t('Свои слова', 'Custom words')} value={(s.custom_words ?? []).join('\n')} onSave={(value) => run('dictionary', () => api.updateCustomWords(value.split('\n').map((word) => word.trim()).filter(Boolean)))} />{toggle(t('Убирать слова-паразиты', 'Remove filler words'), 'filler_word_removal_enabled', api.changeFillerWordRemovalEnabledSetting, t('Убирает «э-э», «а-а», «эм» и похожие паузы.', 'Removes hesitation sounds such as “um” and “uh”.'))}<p>{t('По одному слову на строку. Пустое поле — стандартный список.', 'One per line. Leave blank to use the default list.')}</p><CommitInput multiline aria-label={t('Свои слова-паразиты', 'Custom filler words')} value={(s.custom_filler_words ?? []).join('\n')} onSave={(value) => run('fillers', () => api.updateCustomFillerWords(value.split('\n').map((word) => word.trim()).filter(Boolean)))} /><DictationField label={t('Порог коррекции', 'Correction threshold')}><Input type="range" min={0} max={1} step={.05} defaultValue={s.word_correction_threshold ?? .8} aria-label={t('Порог коррекции', 'Correction threshold')} onChange={(event) => { const value = Number(event.target.value); run('correction', () => api.changeWordCorrectionThresholdSetting(value)) }} /></DictationField></section> : null}
    {page === 'processing' ? <DictationProcessing controller={c} locale={locale} /> : null}
    {page === 'advanced' ? <DictationAdvanced controller={c} locale={locale} /> : null}

  </div>
}
