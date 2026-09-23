import { DictationOverlayView } from '../../features/dictation/DictationOverlay'
import { ReleaseBackdrop } from './ReleaseBackdrop'
import { ModelCard } from '../../features/dictation/ModelCard'
import { DictationShortcut } from '../../features/dictation/DictationShortcut'
import { HandyImport } from '../../features/dictation/HandyImport'
import { WarpMaterial } from '../../shared/ui/WarpMaterial'
import { Mic } from '../../shared/ui/SettingsIcons'
import { asyncNoop, noop, releaseDictation, releaseModel } from './release3Fixtures'
import './release3.css'

export function DictationVisual({ locale, phase = 'recording', progress, frame = 0 }: { locale: 'ru' | 'en'; phase?: string; progress?: number; frame?: number }) {
  const ru = locale === 'ru', controller = releaseDictation(locale)
  const phrase = ru ? 'Хорошие идеи начинаются с пары слов' : 'Good ideas begin with a few words'
  const levels = Array.from({ length: 8 }, (_, i) => .2 + .6 * Math.abs(Math.sin(frame / 180 + i * .82)))
  return <div className="release3-dictation auxiliary-ui">
    <WarpMaterial variant="onboarding" frame={frame} maxPixelCount={progress == null ? undefined : 450_000} />
    <div className="release3-note"><span>{progress == null ? ru ? '3 · Текст в вашем приложении' : '3 · Text in your app' : ru ? 'Новая заметка' : 'New note'}</span><p>{phase === 'completed' || progress == null ? phrase : ru ? 'Здесь появится ваша мысль' : 'Your next thought goes here'}<i /></p></div>
    <div className="release3-recording">{progress == null ? <small>{ru ? '2 · Скажите фразу' : '2 · Say a few words'}</small> : null}<DictationOverlayView status={{ revision: 1, operationId: 1, phase, ready: true, text: '', error: null }} visible levels={levels} text={{ committed: '', tentative: '' }} locale={locale} reducedMotion cancel={asyncNoop} copy={asyncNoop} /></div>
    <div className="release3-shortcut">{progress == null ? <span>{ru ? '1 · Нажмите' : '1 · Press'}</span> : null}<Mic size={17} weight="fill" /><DictationShortcut controller={controller} locale={locale} id="transcribe" /></div>
  </div>
}

export function ModelsVisual({ locale, downloading = false, progress = 0, selected = true, showImport = true }: { locale: 'ru' | 'en'; downloading?: boolean; progress?: number; selected?: boolean; showImport?: boolean }) {
  const model = releaseModel(locale)
  return <div className="release3-models auxiliary-ui dictation-page"><ModelCard model={{ ...model, is_downloaded: selected && !downloading }} locale={locale} selected={selected && !downloading} downloading={downloading} progress={progress} onDownload={noop} onSelect={noop} onCancel={noop} onDelete={noop} onDetails={noop} />{showImport ? <div className="release3-import"><HandyImport controller={releaseDictation(locale)} locale={locale} /><span>{locale === 'ru' ? 'Файлы для распознавания можно скопировать из Handy' : 'Copy your existing speech recognition files from Handy'}</span></div> : null}</div>
}

export function Release3NewScene({ feature, format }: { feature: 'dictation' | 'models'; format: 'readme' | 'telegram' }) {
  const locale = format === 'readme' ? 'en' : 'ru'
  const text = feature === 'dictation'
    ? locale === 'ru' ? ['Говорите вместо печати', 'Нажмите сочетание клавиш и продиктуйте — текст появится в вашем приложении'] : ['Speak instead of typing', 'Press your shortcut and speak — your words appear in the active app']
    : locale === 'ru' ? ['Подготовьте диктовку', 'Скачайте файл для распознавания речи на вашем языке или перенесите его из Handy'] : ['Get ready to dictate', 'Download speech recognition for your language or import it from Handy']
  return <article className={`release-scene release-scene--${format} release3-scene release3-scene--${feature}`}><ReleaseBackdrop /><header className="release-heading"><h1>{text[0]}</h1><p className="release-description">{text[1]}</p></header><main className="release-visual">{feature === 'dictation' ? <DictationVisual locale={locale} /> : <><div className="release3-models-backdrop"><WarpMaterial variant="onboarding" frame={2400} /></div><ModelsVisual locale={locale} selected={false} /></>}</main></article>
}
