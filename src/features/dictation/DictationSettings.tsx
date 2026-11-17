import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Button, Notice } from '../../shared/ui/SettingsControls'
import { RangeSlider } from '../../shared/ui/RangeSlider'
import { Select } from '../../shared/ui/Select'
import { CommitInput, DictationField, DictationToggle } from './DictationFields'
import { DictationDeleteDialog } from './DictationDeleteDialog'
import { DictionaryWordField } from './DictionaryWordField'
import { useDictionaryDraft } from './useDictionaryDraft'
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
  const [deleting, setDeleting] = useState<HistoryEntry | null>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const [historyFailure, setHistoryFailure] = useState<{ id: number; message: string } | null>(null)
  const [thresholdDraft, setThresholdDraft] = useState<number | null>(null)
  const pendingThreshold = useRef<number | null>(null)
  const { api, data } = c
  const words = useDictionaryDraft(data?.settings.custom_words, value => c.run('dictionary', () => api.updateCustomWords(value), 'settings', false))
  const fillers = useDictionaryDraft(data?.settings.custom_filler_words, value => c.run('fillers', () => api.updateCustomFillerWords(value), 'settings', false))
  const model = data?.models.find(item => item.id === data.settings.selected_model)
  const languageOptions = useMemo(() => {
    if (!model?.supports_language_selection) return []
    const names = new Intl.DisplayNames([locale], { type: 'language' })
    return model.supported_languages.map((language): [string, string] => [language, names.of(language) ?? language])
  }, [model, locale])
  const run = (id: string, action: () => Promise<unknown>, after: Parameters<typeof c.run>[2] = 'settings') => { void c.run(id, action, after).catch(() => undefined) }
  const runHistory = (entry: HistoryEntry, id: string, failure: string, action: () => Promise<unknown>) => {
    setHistoryFailure(null)
    void c.run(id, action, 'none', false).catch(() => setHistoryFailure({ id: entry.id, message: failure }))
  }
  const commitThreshold = () => {
    const next = pendingThreshold.current
    if (next == null) return
    pendingThreshold.current = null
    void c.run('correction', () => api.changeWordCorrectionThresholdSetting(next)).then(() => {
      setThresholdDraft(current => current === next ? null : current)
    }).catch(() => { if (pendingThreshold.current === null) pendingThreshold.current = next })
  }
  const microphone = data?.settings.selected_microphone
  const initialized = Boolean(data)
  useEffect(() => {
    if (!initialized || page !== 'general') return
    let active = true
    void api.getMicrophoneChannels(microphone ?? 'default').then((count) => { if (active) setChannels(count) }).catch(() => { if (active) setChannels(0) })
    return () => { active = false }
  }, [api, microphone, initialized, page])
  const error = c.error ? <Notice tone="danger" action={!data ? <Button onClick={() => { void c.run('refresh', c.refresh, 'none').catch(() => {}) }}>{t('Повторить', 'Retry')}</Button> : undefined}>{c.error}</Notice> : null
  if (!data) return <div className="dictation-page"><h2 className="settings-page-heading">{t('Диктовка', 'Dictation')}</h2><section className="dictation-welcome"><span className="dictation-welcome__icon"><Mic size={30} /></span><h3>{t('Настройка диктовки', 'Set up dictation')}</h3><p>{t('Выберите модель для распознавания на этом компьютере.', 'Choose a model to recognize speech on this computer.')}</p><Button type="button" variant="primary" disabled={Boolean(c.busy)} onClick={() => { void onEnable().then(() => onPage('models')).catch(() => undefined) }}>{c.busy ? t('Подготовка…', 'Preparing…') : t('Настроить диктовку', 'Set up dictation')}</Button></section>{error}</div>
  const s = data.settings
  const recording = data.status?.phase === 'recording' || data.status?.phase === 'streaming'
  const toggle = (label: string, field: keyof AppSettings, action: (checked: boolean) => Promise<unknown>, hint?: string) => <DictationToggle label={label} checked={Boolean(s[field])} hint={hint} onChange={(checked) => run(String(field), () => action(checked))} />
  const select = (label: string, value: string | number, options: [string, string][], action: (value: string) => Promise<unknown>, hint?: string, after: Parameters<typeof c.run>[2] = 'settings') => <DictationField label={label} hint={hint}><Select ariaLabel={label} value={String(value)} onChange={(next) => run(label, () => action(next), after)} options={options.map(([value, label]) => ({ value, label }))} /></DictationField>
  return <div ref={pageRef} className="dictation-page" data-reduced-motion={reducedMotion || undefined} aria-busy={Boolean(c.busy)}>
    {page !== 'models' ? <h2 tabIndex={-1} className="settings-page-heading">{dictationPages[page][ru ? 0 : 1]}</h2> : null}
    {page === 'processing' ? null : error}
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
      <section className="dictation-card"><h3>{t('Пробная запись', 'Test recording')}</h3>
        {!c.enabled ? <Button variant="primary" disabled={Boolean(c.busy)} onClick={() => { void onEnable().catch(() => {}) }}>{t('Включить диктовку', 'Enable dictation')}</Button>
          : !model?.is_downloaded ? <Button variant="primary" onClick={() => onPage('models')}>{t('Выбрать модель', 'Choose a model')}</Button>
          : !data.microphones.length && !recording ? <Button onClick={() => onPage('advanced')}>{t('Проверить микрофон', 'Check microphone')}</Button>
          : <><p>{t('Для вставки в другое приложение нажмите сочетание в его поле ввода.', 'To insert into another app, use your shortcut in its text field.')}</p>
            <Button variant="primary" disabled={Boolean(c.busy)} onClick={() => { void c.run('try', api.toggle, 'none').catch(() => {}) }}><Mic size={16} />{recording ? t('Закончить запись', 'Stop recording') : t('Начать запись', 'Start recording')}</Button>
            {recording ? <Button disabled={Boolean(c.busy)} onClick={() => { void c.run('cancel', api.cancelOperation, 'none').catch(() => {}) }}>{t('Отменить запись', 'Cancel recording')}</Button> : null}
          </>}
      </section>
    </> : null}
    {page === 'models' ? <DictationModels controller={c} locale={locale} /> : null}
    {page === 'history' ? <>
      <section className="dictation-history-settings">
        {select(t('Хранить записи', 'Keep recordings'), s.recording_retention_period ?? 'preserve_limit', [['never', t('Без срока', 'Keep indefinitely')], ['preserve_limit', t('В пределах истории', 'Within history limit')], ['days3', t('3 дня', '3 days')], ['weeks2', t('2 недели', '2 weeks')], ['months3', t('3 месяца', '3 months')]], (value) => api.updateRecordingRetentionPeriod(({ days3: 'days3', weeks2: 'weeks2', months3: 'months3' }[value] ?? value)), undefined, ['settings', 'history'])}<DictationField label={t('Размер истории', 'History limit')}><CommitInput type="number" min={1} max={10000} value={String(s.history_limit ?? 5)} onSave={(value) => run('history-limit', () => api.updateHistoryLimit(Math.max(1, Math.min(10000, Number(value)))), ['settings', 'history'])} /></DictationField>
        {onShowLatestMessage ? <div className="dictation-history-island-option">
          <DictationToggle label={translate('dictation.latestSetting')} hint={translate('dictation.latestHint')}
            checked={showLatestMessage} onChange={onShowLatestMessage} />
        </div> : null}
      </section>
      {data.history.length ? data.history.map(entry => {
        const transcript = entry.post_processed_text ?? entry.transcription_text
        return <article className="dictation-history" key={entry.id} data-history-entry={entry.id}>
          <time dateTime={new Date(entry.timestamp * 1000).toISOString()}>{new Date(entry.timestamp * 1000).toLocaleString(locale)}</time>
          <p>{transcript}</p>
          <div className="dictation-history__actions">
            <Button onClick={() => { setCopied(null); runHistory(entry, 'copy-history', t('Не удалось скопировать текст.', 'Could not copy the text.'), async () => {
              await navigator.clipboard.writeText(transcript); setCopied(entry.id)
            }) }}>{copied === entry.id ? <Check size={15} /> : <Copy size={15} />}{copied === entry.id ? t('Скопировано', 'Copied') : t('Копировать', 'Copy')}</Button>
            <Button disabled={!c.enabled || Boolean(c.busy)} onClick={() => runHistory(entry, 'retry-history', t('Не удалось распознать запись.', 'Could not transcribe the recording.'), () => api.retryHistoryEntryTranscription(entry.id))}><RotateCcw size={15} />{t('Распознать снова', 'Transcribe again')}</Button>
            <Button onClick={() => runHistory(entry, 'play-audio', t('Не удалось открыть аудио.', 'Could not open the audio.'), async () => setHistoryAudio({ id: entry.id, url: convertFileSrc(await api.getAudioFilePath(entry.file_name)) }))}>{t('Аудио', 'Audio')}</Button>
            <Button aria-pressed={entry.saved} disabled={Boolean(c.busy)} onClick={() => runHistory(entry, 'save-history', t('Не удалось изменить сохранение записи.', 'Could not update this recording.'), () => api.toggleHistoryEntrySaved(entry.id))}>{entry.saved ? t('Сохранена', 'Saved') : t('Сохранить', 'Keep')}</Button>
            <Button aria-label={t('Удалить запись', 'Delete entry')} disabled={Boolean(c.busy)} onClick={() => setDeleting(entry)}><Trash2 size={15} /></Button>
          </div>
          {historyFailure?.id === entry.id ? <Notice tone="danger">{historyFailure.message}</Notice> : null}
          {historyAudio?.id === entry.id ? <audio controls src={historyAudio.url} onError={() => setHistoryFailure({ id: entry.id, message: t('Не удалось воспроизвести аудио.', 'Could not play the audio.') })} /> : null}
        </article>
      }) : <div className="dictation-empty"><Mic size={28} /><h3>{t('Записей пока нет', 'No recordings yet')}</h3><p>{t('Нажмите сочетание для записи.', 'Start dictating with your keyboard shortcut.')}</p></div>}
      {deleting ? <DictationDeleteDialog title={t('Удалить запись?', 'Delete recording?')} detail={t('Из истории удалятся текст и аудиозапись.', 'The transcript and audio will be removed from history.')} locale={locale}
        onClose={() => setDeleting(null)} onDelete={async () => {
          const index = data.history.findIndex(entry => entry.id === deleting.id)
          const neighbor = data.history[index + 1] ?? data.history[index - 1]
          await c.run('delete-history', () => api.deleteHistoryEntry(deleting.id), 'none', false)
          requestAnimationFrame(() => {
            const target = pageRef.current?.querySelector<HTMLElement>(`[data-history-entry="${neighbor?.id}"] button`) ?? pageRef.current?.querySelector<HTMLElement>('h2')
            target?.focus({ preventScroll: true })
          })
        }} /> : null}
    </> : null}
    {page === 'history' && data.hasMoreHistory ? <Button type="button" disabled={c.busy === 'more-history'} onClick={() => { void c.run('more-history', c.loadMoreHistory, 'none').catch(() => {}) }}>{t('Показать ещё', 'Load more')}</Button> : null}
    {page === 'dictionary' ? <section className="dictation-card dictation-dictionary"><h3>{t('Свои слова', 'Custom words')}</h3><p>{t('Каждое слово или фраза — с новой строки.', 'One word or phrase per line.')}</p><DictionaryWordField field={words} label={t('Свои слова', 'Custom words')} locale={locale} />{toggle(t('Убирать слова-паразиты', 'Remove filler words'), 'filler_word_removal_enabled', api.changeFillerWordRemovalEnabledSetting, t('Убирает «э-э», «а-а», «эм» и похожие паузы.', 'Removes hesitation sounds such as “um” and “uh”.'))}<p>{t('Оставьте поле пустым, чтобы использовать стандартный список слов-паразитов.', 'Leave blank to use the default filler words.')}</p><DictionaryWordField field={fillers} label={t('Свои слова-паразиты', 'Custom filler words')} locale={locale} /><DictationField label={t('Порог коррекции', 'Correction threshold')}><RangeSlider min={0} max={1} step={.05} value={thresholdDraft ?? s.word_correction_threshold ?? .8} aria-label={t('Порог коррекции', 'Correction threshold')} onChange={event => { pendingThreshold.current = event.currentTarget.valueAsNumber; setThresholdDraft(pendingThreshold.current) }} onPointerUp={commitThreshold} onKeyUp={commitThreshold} onBlur={commitThreshold} /></DictationField></section> : null}
    {page === 'processing' ? <DictationProcessing controller={c} locale={locale} /> : null}
    {page === 'advanced' ? <DictationAdvanced controller={c} locale={locale} /> : null}

  </div>
}
