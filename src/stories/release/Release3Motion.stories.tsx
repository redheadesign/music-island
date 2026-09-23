import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { getDefaultConfig } from '../../app/tauriApi'
import { withUiPrefs } from '../../shared/lib/uiPrefs'
import { getIslandLayout, withIslandLayout } from '../../shared/lib/islandLayout'
import { WarpMaterial } from '../../shared/ui/WarpMaterial'
import { IslandFeedback } from '../../shared/ui/PressFeedback'
import { IslandTopIndicator } from '../../features/overlay/IslandTopIndicator'
import { ChevronsLeftRight, MousePointer2 } from 'lucide-react'
import repositoryQr from './assets/repository-qr.svg'
import { MusicModule } from '../../features/music/MusicModule'
import { APPEARANCE_PREVIEW_MEDIA } from '../../features/settings/previewMedia'
import { SettingsPanel } from '../../features/settings/SettingsPanel'
import { DictationSettings } from '../../features/dictation/DictationSettings'
import { health } from '../fixtures'
import { AppLogo } from '../../shared/ui/AppLogo'
import { DictationVisual, ModelsVisual } from './Release3Visuals'
import { noop, releaseDictation } from './release3Fixtures'
import { saveReleaseImage, settleReleaseFrame } from './release3Export'
import timeline from './release3Motion.config.json'
import concepts from './release3Concepts.config.json'
import { HandyTransferVisual } from './HandyTransferVisual'
import { NatureInsert } from './NatureInsert'
import './release3Motion.css'

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const ease = (value: number) => 1 - (1 - clamp(value)) ** 3
type Concept = 'classic' | 'continuous' | 'rhythm'
const getTimeline = (concept: Concept) => concept === 'classic' ? timeline : concepts[concept]
const sectionAt = (cuts: number[], time: number) => {
  const end = cuts.findIndex((end, i) => i > 0 && time < end)
  return end < 0 ? cuts.length - 2 : Math.max(0, end - 1)
}
const wipePosition = (time: number) => time < 10
  ? .2 + .6 * ease((time - 7.2) / 2.8)
  : .8 - .35 * ease((time - 10) / 1.9)
const titles = {
  en: ['Your music, under control', 'Make your island your own', 'Get ready to dictate', 'Speak instead of typing', 'Find your words in History', 'Already using Handy?', 'Music Island 3.0'],
  ru: ['Музыка под контролем', 'Настройте островок под себя', 'Подготовьте диктовку', 'Говорите вместо печати', 'Вернитесь к тексту в истории', 'Уже пользуетесь Handy?', 'Music Island 3.0'],
}
const captions = {
  en: ['Pause and skip tracks from the top edge of your Windows desktop', 'Choose your controls, size and a light or dark theme', 'Download speech recognition for your language — it runs on your computer', 'Press your shortcut and speak — your words appear in the active app', 'Copy your text or listen to the recording', 'Bring your downloaded speech recognition files with you', 'Music controls and voice typing for Windows'],
  ru: ['Плеер у верхнего края Windows — ставьте на паузу и переключайте треки', 'Выберите кнопки, размер и оформление — светлое или тёмное', 'Скачайте файл для распознавания речи — диктовка работает на компьютере', 'Нажмите сочетание клавиш и говорите — текст появится в вашем приложении', 'Скопируйте текст или прослушайте запись', 'Перенесите скачанные файлы для распознавания речи', 'Плеер и голосовой ввод для Windows'],
}

export function MotionScene({ locale, time, concept = 'classic' }: { locale: 'en' | 'ru'; time: number; concept?: Concept }) {
  const cuts = getTimeline(concept).cuts
  const section = sectionAt(cuts, time)
  const index = concept === 'rhythm' ? [0, 0, 3, 3, 1, 1, 6][section] : section
  const elapsed = time - cuts[section], remaining = cuts[section + 1] - time
  const classic = concept === 'classic'
  const enter = ease(elapsed / (classic ? .65 : .18)), leave = index === 6 ? 1 : classic ? ease(remaining / .4) : 1
  const pairedNature = concept === 'rhythm' && section < 6
  const plateIndex = Math.floor(section / 2) + 1
  const plateTime = pairedNature ? time - cuts[section - section % 2] : 0
  const sceneElapsed = pairedNature ? Math.max(0, plateTime - 3.8) : elapsed
  const rhythmOpening = pairedNature && section < 2
  const openingReveal = ease((plateTime - 3.72) / .35)
  const musicTime = classic ? time : concept === 'continuous' ? elapsed * 1.35 : rhythmOpening ? Math.max(0, time - 3.8) : elapsed + 2
  const nature = concept === 'rhythm' && [0, 2, 4].includes(section)
  const natureFinal = concept === 'rhythm' && index === 6
  let config = getDefaultConfig()
  config.appearance.locale = locale
  config.appearance.reducedMotion = true
  const rearranged = concept === 'continuous' && index === 1 && elapsed >= 1.7
  if (rearranged) {
    const layout = getIslandLayout(config)
    config = withIslandLayout(config, { ...layout, zones: { ...layout.zones, player: ['artwork', 'previous', 'transport', 'next', 'progress'] } })
  }
  const wipe = wipePosition(classic ? time : 6 + sceneElapsed * (concept === 'rhythm' ? 2 : .9)) * 100
  const playing = musicTime < 3.45 || musicTime >= 4.2
  const approach = ease((musicTime - .7) / 1.0)
  const opened = ease((musicTime - 1.9) / .32)
  const peek = musicTime < 1.9 ? ease((musicTime - 1.6) / .3) * .6 : 0
  const frame = Math.round(time * 1000)
  const recording = sceneElapsed < (classic ? 4.8 : 3.5) ? 'recording' : sceneElapsed < (classic ? 6.2 : 4.3) ? 'transcribing' : 'completed'
  return <article className={`motion-scene motion-scene--${locale} motion-scene--${concept}${nature ? ' motion-scene--nature' : ''}${pairedNature ? ' motion-scene--opening' : ''}${natureFinal ? ' motion-scene--nature-final' : ''}`} data-time={time.toFixed(3)}>
    <WarpMaterial className="motion-atmosphere" variant="onboarding" frame={[1,4,5,6].includes(index) ? cuts[index] * 160 : frame * .16} maxPixelCount={450_000} />
    {natureFinal ? <NatureInsert index={1} time={elapsed * .49} backdrop /> : null}
    <header className="motion-heading" style={{ opacity: pairedNature ? openingReveal : nature ? 0 : enter * leave, transform: classic ? `translateY(${(1 - enter) * 22}px)` : undefined }}><h1>{titles[locale][index]}</h1><p>{captions[locale][index]}</p></header>
    <main className="motion-stage" style={{ opacity: pairedNature ? openingReveal : nature ? 0 : classic ? enter * leave : 1, transform: classic ? `translateY(${(1 - enter) * 45}px) scale(${.97 + enter * .03})` : undefined, clipPath: !classic && !nature && !pairedNature && index !== 6 ? `inset(0 ${(1 - ease(elapsed / .32)) * 100}% 0 0 round 32px)` : undefined }}>
      {index === 0 ? <div className="motion-music-backdrop">{concept !== 'rhythm' ? <WarpMaterial variant="onboarding" frame={frame * .3} maxPixelCount={450_000} /> : null}
        <div className="motion-desktop-edge" />
        <div className="motion-top-indicator" style={{ opacity: 1 - opened }}><div className="edge-trigger" style={{ '--peek-progress': peek, '--peek-x': '110px' } as React.CSSProperties}><IslandTopIndicator progressPercent={51 + time * .2} hidden={peek > .08} /></div></div>
        <div className="motion-music island-root" style={{ opacity: opened, marginTop: -18 * (1 - opened) }}><IslandFeedback className="island-card island-surface"><MusicModule media={{ ...APPEARANCE_PREVIEW_MEDIA, playbackStatus: playing ? 'playing' : 'paused', isLiked: musicTime >= 4.2 }} progressMs={109000 + time * 1000} progressPercent={51 + time * .2} density="balanced" showArtwork showTitle showArtist showProgress showSource={false} showPreviousNext reducedMotion locale={locale} onCommand={noop} /></IslandFeedback></div>
        <MousePointer2 className="motion-cursor" size={34} fill="white" stroke="#202020" strokeWidth={1.5} style={{ left: `${72 - approach * 22}%`, top: `${70 - approach * 69.4}%`, opacity: musicTime > 2.7 ? 1 - ease((musicTime - 2.7) / .5) : ease(musicTime / .4) }} />
        <span className="motion-edge-caption" style={{ opacity: 1 - opened }}>{locale === 'ru' ? 'Подведите мышь к верхнему краю' : 'Move your pointer to the top edge'}</span>
      </div> : null}
      {index === 1 ? <div className="motion-theme-comparison" role="img" aria-label={locale === 'ru' ? 'Сравнение светлой и тёмной темы' : 'Light and dark theme comparison'}>
        {(['dark', 'light'] as const).map(theme => <div key={theme} aria-hidden="true" inert className={`motion-theme-layer motion-theme-layer--${theme}`} style={theme === 'light' ? { clipPath: `inset(0 ${100 - wipe}% 0 0)` } : undefined}><div className="motion-settings settings-window-root" data-color-scheme={theme} data-export-still={`${locale}-${theme}-${rearranged}`}><SettingsPanel config={withUiPrefs(config, { settingsColorScheme: theme })} smtcHealth={health} mediaSessions={[]} onChange={noop} onCopyDiagnostics={noop} onRefreshSources={noop} /></div></div>)}
        <span className="motion-theme-label motion-theme-label--light">{locale === 'ru' ? 'Светлая' : 'Light'}</span><span className="motion-theme-label motion-theme-label--dark">{locale === 'ru' ? 'Тёмная' : 'Dark'}</span>
        <div className="motion-theme-divider" style={{ left: `${wipe}%` }}><span><ChevronsLeftRight size={24} /></span><MousePointer2 className="motion-theme-pointer" size={32} fill="white" stroke="#202020" strokeWidth={1.5} /></div>
      </div> : null}
      {index === 2 ? <ModelsVisual showImport={classic} locale={locale} selected={elapsed > 2.2} downloading={index === 2 && elapsed > .6 && elapsed <= 2.2} progress={clamp((elapsed - .6) / 1.6) * 100} /> : null}
      {index === 5 ? <HandyTransferVisual locale={locale} time={elapsed} /> : null}
      {index === 3 ? <DictationVisual locale={locale} phase={recording} progress={sceneElapsed} frame={frame} /> : null}
      {index === 4 ? <div className="motion-history settings-panel"><DictationSettings controller={releaseDictation(locale)} page="history" locale={locale} onEnable={async () => {}} onPage={noop} /></div> : null}
      {index === 6 ? <div className="motion-end"><div className="motion-end__identity"><AppLogo variant="portrait" className="motion-end__logo" size={340} alt="Music Island" /><span>Windows 10 / 11</span></div><div className="motion-end__action"><ol className="motion-start">{(locale === 'ru' ? ['Скачайте music-island.exe', 'Сохраните в удобную папку', 'Запустите — установка не нужна'] : ['Download music-island.exe', 'Save it in a folder you keep', 'Open it — no installation needed']).map((step, i) => <li key={step}><span>{i + 1}</span>{step}</li>)}</ol><a className="motion-repository" href="https://github.com/redheadesign/music-island"><img src={repositoryQr} width={246} height={246} alt="QR: github.com/redheadesign/music-island" /><strong>{locale === 'ru' ? 'Скачать на GitHub' : 'Download on GitHub'}</strong><span>github.com/redheadesign/music-island</span></a></div></div> : null}
    </main>
    {pairedNature ? <NatureInsert index={plateIndex} time={plateTime} /> : null}
    <footer className="motion-brand"><AppLogo size={26} />Music Island</footer>
  </article>
}

function MotionWorkshop({ locale: initialLocale = 'en', concept: initialConcept = 'classic' }: { locale?: 'en' | 'ru'; concept?: Concept }) {
  const [concept, setConcept] = useState<Concept>(initialConcept)
  const active = getTimeline(concept), cuts = active.cuts
  const duration = cuts[cuts.length - 1], totalFrames = duration * timeline.fps, lastTime = duration - 1 / timeline.fps
  const [locale, setLocale] = useState(initialLocale), [time, setTime] = useState(0)
  const exportId = concept === 'classic' ? locale : concept + '-' + locale
  const [playing, setPlaying] = useState(false), [exporting, setExporting] = useState(false), [status, setStatus] = useState(`${duration} s · ${timeline.fps} fps`)
  const [startFrame, setStartFrame] = useState(0)
  const [endFrame, setEndFrame] = useState<number | undefined>()
  const root = useRef<HTMLDivElement>(null), cancelled = useRef(false)
  useEffect(() => {
    if (!playing) return
    const start = performance.now() - time * 1000
    let request = 0
    const tick = () => { const next = (performance.now() - start) / 1000; setTime(Math.min(next,lastTime)); if (next < duration && !document.hidden) request = requestAnimationFrame(tick); else setPlaying(false) }
    request = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(request)
    // time is the starting cursor; animation owns it until paused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])
  useEffect(() => () => { cancelled.current = true }, [])
  const exportMovie = async (preview = false) => {
    setPlaying(false); setExporting(true); cancelled.current = false
    try {
      const cache = new Map<string, string>()
      const frames = preview ? active.storyboardTimes.map(time => Math.round(time * timeline.fps)) : Array.from({ length: Math.max(0, Math.min(totalFrames - 1, endFrame ?? totalFrames - 1) - startFrame + 1) }, (_, i) => i + startFrame)
      for (const frame of frames) {
        if (cancelled.current) break
        flushSync(() => { setTime(frame / timeline.fps); setStatus(`${locale.toUpperCase()} · ${frame + 1} / ${totalFrames}`) })
        const scene = root.current!.querySelector<HTMLElement>('.motion-scene')!
        const seconds = frame / timeline.fps
        const section = sectionAt(cuts, seconds)
        const settled = seconds >= cuts[section] + .7 && (section === 6 || seconds < cuts[section + 1] - .45)
        const key = settled && (section === 6 && concept !== 'rhythm' || concept === 'classic' && section === 4 || concept !== 'rhythm' && section === 5 && seconds >= cuts[5] + 2.4) ? String(section) : undefined
        const cached = key ? cache.get(key) : undefined
        if (!cached) await settleReleaseFrame(scene, preview || frame === startFrame || [104,126].includes(frame) || cuts.some(cut => frame === cut * timeline.fps))
        const png = await saveReleaseImage(scene, 'frame', `${exportId}-${String(frame).padStart(5, '0')}`, cached)
        if (key) cache.set(key, png)
        if (frame === Math.round(active.posterTime * timeline.fps)) await saveReleaseImage(scene, 'poster', exportId)
      }
      setStatus(cancelled.current ? 'Paused — choose the next frame to resume' : `Saved ${locale.toUpperCase()}: ${preview ? "storyboard" : `${frames.length} frames`}`)
    } catch (error) { setStatus(String(error)) } finally { setExporting(false) }
  }
  return <><div ref={root}><MotionScene locale={locale} time={time} concept={concept} /></div><nav className="release3-controls" aria-label="Motion export"><select aria-label="Concept" disabled={exporting} value={concept} onChange={event => { setConcept(event.target.value as Concept); setTime(0); setStartFrame(0); setEndFrame(undefined); setPlaying(false); if (event.target.value !== 'classic') setLocale('ru') }}><option value="classic">Classic · 46 s</option><option value="continuous">Одно движение · 40 s</option><option value="rhythm">В своём ритме · 36 s</option></select><select aria-label="Video language" disabled={exporting} value={locale} onChange={event => setLocale(event.target.value as 'ru' | 'en')}><option value="en" disabled={concept !== 'classic'}>EN · 1920 × 1080</option><option value="ru">RU · 1080 × 1920</option></select><button disabled={exporting} onClick={() => { if (time >= lastTime) setTime(0); setPlaying(!playing) }}>{playing ? 'Pause preview' : 'Play preview'}</button><input aria-label="Timeline" type="range" min="0" max={lastTime} step={1 / timeline.fps} value={time} disabled={exporting} onChange={event => { setPlaying(false); setTime(Number(event.target.value)) }} /><input aria-label="Start frame" type="number" min="0" max={totalFrames - 1} value={startFrame} disabled={exporting} onChange={event => setStartFrame(Math.round(Math.max(0,Math.min(totalFrames - 1,Number(event.target.value)))))} /><input aria-label="End frame" type="number" min="0" max={totalFrames - 1} value={endFrame ?? totalFrames - 1} disabled={exporting} onChange={event => setEndFrame(Math.round(Math.max(0, Math.min(totalFrames - 1, Number(event.target.value)))))} /><button disabled={exporting} onClick={() => void exportMovie(true)}>Export storyboard</button><button disabled={exporting} onClick={() => void exportMovie()}>Export {totalFrames} frames</button>{exporting ? <button onClick={() => { cancelled.current = true }}>Pause export</button> : null}<output aria-live="polite">{status}</output></nav></>
}
const meta = { title: 'Screens/Release3Motion', component: MotionWorkshop, parameters: { layout: 'fullscreen', workshop: { bare: true } } } satisfies Meta<typeof MotionWorkshop>
export default meta
type Story = StoryObj<typeof meta>
export const Portfolio: Story = { name: 'Шоу-рилл · EN · 16:9' }
export const Telegram: Story = { name: 'Шоу-рилл · RU · 9:16', args: { locale: 'ru' } }

export const Continuous: Story = { name: 'Одно движение · RU · 40 секунд', args: { locale: 'ru', concept: 'continuous' } }
export const Rhythm: Story = { name: 'В своём ритме · RU · 36 секунд', args: { locale: 'ru', concept: 'rhythm' } }


