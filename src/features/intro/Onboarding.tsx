import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button } from '../../shared/ui/SettingsControls'
import { IslandFeedback } from '../../shared/ui/PressFeedback'
import { WarpMaterial } from '../../shared/ui/WarpMaterial'
import { ArrowLeft, ArrowRight, Check, Mouse } from '../../shared/ui/SettingsIcons'
import { IslandLayoutEditor } from '../settings/IslandLayoutEditor'
import { MusicModule } from '../music/MusicModule'
import { APPEARANCE_PREVIEW_MEDIA } from '../settings/previewMedia'
import { DictationOverlayView } from '../dictation/DictationOverlay'
import { getSettingsColorScheme } from '../../shared/lib/uiPrefs'
import type { AppConfig } from '../../shared/lib/types'
import { AppLogo } from '../../shared/ui/AppLogo'
import './Onboarding.css'

export interface OnboardingProps {
  config: AppConfig
  onFinish: (enableAutostart?: boolean) => Promise<void> | void
  exePath?: string | null
  /** Also lets the workshop review each real step directly. */
  initialStep?: number
}

export function Onboarding({ config, onFinish, exePath, initialStep = 0 }: OnboardingProps) {
  const [step, setStep] = useState(initialStep)
  const [demoConfig, setDemoConfig] = useState(config)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const ru = config.appearance.locale !== 'en'
  const locale = ru ? 'ru' : 'en'
  const systemReduced = useReducedMotion()
  const reduced = Boolean(config.appearance.reducedMotion || systemReduced)
  const autostart = config.behavior.launchAtStartup
  const titles = ru ? ['Музыка под контролем', 'Настройте островок под себя', 'Говорите вместо печати', 'Запуск вместе с Windows'] : ['Your music, under control', 'Make your island your own', 'Speak instead of typing', 'Ready when Windows starts']
  const descriptions = ru ? [
    'Подведите мышь к верхнему краю — ставьте музыку на паузу и переключайте треки',
    'Выберите нужные кнопки и перетащите их прямо здесь',
    'Нажмите сочетание клавиш и говорите — текст появится в вашем приложении',
    'Островок будет готов к работе, когда вы войдёте в Windows',
  ] : [
    'Move to the top edge to pause music and skip tracks',
    'Choose the controls you use and drag them into place here',
    'Press your shortcut and speak — your words appear in the active app',
    'Your island will be ready whenever you sign in to Windows',
  ]
  const finish = async (enableAutostart?: boolean) => {
    if (busy) return
    setBusy(true); setError(false)
    try { await onFinish(enableAutostart) } catch { setError(true); setBusy(false) }
  }
  return <main className="onboarding" data-color-scheme={getSettingsColorScheme(config)} data-reduced-motion={reduced || undefined}>
    <section className="onboarding__card" aria-label={ru ? 'Знакомство с Music Island' : 'Meet Music Island'} aria-busy={busy}>
      <header className="onboarding__header"><span><AppLogo size={24} />Music Island</span>{step < 3 ? <Button variant="ghost" size="compact" disabled={busy} onClick={() => setStep(3)}>{ru ? 'Пропустить знакомство' : 'Skip introduction'}</Button> : <span />}</header>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} className="onboarding__page" initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .18 }}>
          <div className={`onboarding__visual onboarding__visual--${step}`}>
            <WarpMaterial variant="onboarding" reducedMotion={reduced} />
            {step === 0 ? <><div className="onboarding__music island-root"><IslandFeedback className="island-card island-surface"><MusicModule media={{ ...APPEARANCE_PREVIEW_MEDIA, playbackStatus: playing ? 'playing' : 'paused' }} progressMs={APPEARANCE_PREVIEW_MEDIA.positionMs} progressPercent={34} density="balanced" showArtwork showTitle showArtist showProgress showSource={false} showPreviousNext locale={locale} reducedMotion={reduced} onCommand={command => setPlaying(command === 'play-pause' ? !playing : true)} /></IslandFeedback></div><Mouse className="onboarding__mouse" size={27} aria-hidden="true" /></> : null}
            {step === 1 ? <div className="onboarding__layout settings-panel"><IslandLayoutEditor config={demoConfig} onChange={setDemoConfig} active={false} showHeading={false} /></div> : null}
            {step === 2 ? <div className="onboarding__dictation"><div className="onboarding__note"><span>{ru ? 'Новая заметка' : 'New note'}</span><p>{ru ? 'Хорошие идеи начинаются с пары слов' : 'Good ideas begin with a few words'}</p></div><DictationOverlayView status={{ revision: 1, operationId: 1, phase: 'recording', ready: true, text: '', error: null }} visible levels={[.2,.6,.4,.8,.9,.5,.35,.65]} text={{ committed: '', tentative: '' }} locale={locale} reducedMotion={reduced} cancel={async () => {}} copy={async () => {}} /><kbd>Ctrl + Space</kbd></div> : null}
            {step === 3 ? <div className="onboarding__startup"><AppLogo size={112} alt="Music Island" /><span><Check size={16} />{ru ? 'Готов к работе' : 'Ready to go'}</span></div> : null}
          </div>
          <h1>{titles[step]}</h1><p>{descriptions[step]}</p>
          <div className="onboarding__detail">{step === 2 ? <small>{ru ? 'Диктовку можно настроить после знакомства. Better Voice поможет убрать шум микрофона' : 'Set up dictation after this tour. Better Voice can also reduce microphone noise'}</small> : step === 3 ? <><small>{autostart ? ru ? 'Автозагрузка уже включена' : 'Launch at startup is already enabled' : ru ? 'Оставьте файл приложения в этой папке' : 'Keep the application file in this folder'}</small>{exePath ? <details><summary>{ru ? 'Путь к приложению' : 'Application location'}</summary><code>{exePath}</code></details> : null}</> : null}</div>
        </motion.div>
      </AnimatePresence>
      <div className="onboarding__message" aria-live="polite">{error ? <span role="alert">{ru ? 'Не удалось завершить настройку. Повторите или нажмите «Не сейчас».' : 'Could not finish setup. Try again or choose “Not now”.'}</span> : null}</div>
      <footer className="onboarding__footer"><Button variant="ghost" className="onboarding__back" disabled={step === 0 || busy} aria-label={ru ? 'Назад' : 'Back'} onClick={() => setStep(step - 1)}><ArrowLeft size={18} /></Button><div className="onboarding__steps" role="group" aria-label={`${step + 1} / 4`}>{titles.map((title, index) => <button type="button" key={title} disabled={busy} aria-label={title} aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)} />)}</div><div className="onboarding__actions">{step === 3 && !autostart ? <Button variant="ghost" disabled={busy} onClick={() => void finish()}>{ru ? 'Не сейчас' : 'Not now'}</Button> : null}<Button variant="primary" disabled={busy} onClick={() => step < 3 ? setStep(step + 1) : void finish(autostart ? undefined : true)}>{busy ? ru ? 'Сохранение…' : 'Saving…' : step < 3 ? ru ? 'Далее' : 'Next' : autostart ? ru ? 'Начать' : 'Start' : ru ? 'Включить и начать' : 'Enable and start'}{step < 3 ? <ArrowRight size={17} /> : null}</Button></div></footer>
    </section>
  </main>
}
