import { useEffect, useRef, useState, type CSSProperties, type TransitionEvent } from 'react'
import { formatTime } from '../../shared/lib/format'
import { useReducedMotion } from 'framer-motion'
import { Check, Copy, LoaderCircle, Mic, Stop, X } from '../../shared/ui/SettingsIcons'
import { useDictationOverlay, useNativeBackdrop } from '../../app/useIslandApp'
import type { DictationStatus } from '../../shared/lib/dictationTypes'
import { defaultDictationAppearance, dictationPaletteColors, type DictationAppearance } from '../../shared/lib/dictationAppearance'
import { getInterfaceThemeDefinition, type InterfaceThemeId } from '../../shared/lib/interfaceTheme'
import type { InterfacePaletteId, buildInterfacePaletteStyle } from '../../shared/lib/interfacePalette'
import { IslandGlassOptic } from '../../shared/ui/IslandGlassOptic'
import { DictationVisual } from './DictationVisual'
import { DictationCloudSurface } from './DictationCloudSurface'
import './dictation.css'
import './dictation-material.css'
export function DictationOverlay() { return <DictationOverlayView {...useDictationOverlay()} /> }
export function DictationOverlayView({ status, visible, levels, text, locale = 'ru', reducedMotion, appearance = defaultDictationAppearance, interfaceTheme = 'classic', interfacePalette = 'custom', paletteStyle, active = true, demo = false, finish, cancel, copy }: {
  status: DictationStatus; visible: boolean; levels: number[]; text: { committed: string; tentative: string }; locale?: 'ru' | 'en'; reducedMotion?: boolean; cancel: () => Promise<unknown>; copy: () => Promise<unknown>
  appearance?: DictationAppearance; active?: boolean; demo?: boolean
  interfaceTheme?: InterfaceThemeId; interfacePalette?: InterfacePaletteId
  paletteStyle?: ReturnType<typeof buildInterfacePaletteStyle>
  finish?: () => Promise<unknown>
}) {
  const [copyFailure, setCopyFailure] = useState<number | null>(null)
  const [loadNotice, setLoadNotice] = useState<number | null>(null)
  useEffect(() => {
    if (!visible || !active || !status.modelLoading || status.phase !== 'streaming') return
    const timer = window.setTimeout(() => setLoadNotice(status.operationId), 2000)
    return () => window.clearTimeout(timer)
  }, [visible, active, status.modelLoading, status.phase, status.operationId])
  const core = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const previewRoot = useRef<HTMLDivElement>(null)
  const progressArt = useRef<HTMLSpanElement>(null)
  const resizing = useRef(new Set<string>())
  const [materialResizing, setMaterialResizing] = useState(false)
  const systemReducedMotion = useReducedMotion()
  const still = Boolean(reducedMotion || systemReducedMotion || !active)
  const ru = locale === 'ru'
  const recording = status.phase === 'recording' || status.phase === 'streaming'
  const recordingControl = status.shortcutActivation !== 'push_to_talk'
  const labels: Record<string, [string, string]> = { preparing: ['Подготовка…', 'Preparing…'], recording: ['Слушаю', 'Listening'], streaming: ['Слушаю', 'Listening'], transcribing: ['Распознаю…', 'Transcribing…'], processing: ['Обработка с ИИ…', 'Processing with AI…'], completed: ['Готово', 'Done'], cancelled: ['Запись отменена', 'Cancelled'], error: [status.text ? 'Не удалось вставить' : 'Не удалось распознать', status.text ? 'Could not paste' : 'Transcription failed'] }
  const loadingLabel = ru ? 'Загружаю модель…' : 'Loading model…'
  const progress = status.phase === 'transcribing' && !status.modelLoading && status.progress && status.progress.totalAudioMs > 0 ? status.progress : null
  const elapsed = progress ? Math.min(progress.totalAudioMs, Math.max(0, progress.completedAudioMs)) : 0
  const progressTime = progress ? <span role="progressbar" className={appearance.theme === 'classic' ? undefined : 'dictation-cloud__duration'}
    aria-label={ru ? 'Распознано аудио' : 'Audio transcribed'} aria-valuemin={0}
    aria-valuenow={elapsed / 1000} aria-valuemax={progress.totalAudioMs / 1000}
    aria-valuetext={`${formatTime(elapsed)} ${ru ? 'из' : 'of'} ${formatTime(progress.totalAudioMs)}`}>
    {formatTime(elapsed)} / {formatTime(progress.totalAudioMs)}
  </span> : null
  const label = status.phase === 'transcribing' && status.modelLoading ? loadingLabel : labels[status.phase]?.[ru ? 0 : 1] ?? ''
  const error = status.phase === 'error'
  const message = error && copyFailure === status.operationId ? ru ? 'Не удалось скопировать' : 'Could not copy' : label
  const closeLabel = ru ? 'Закрыть' : 'Dismiss'
  const copyLabel = ru ? 'Скопировать текст' : 'Copy text'
  const hasText = Boolean(text.committed || text.tentative)
  const noticeShown = status.phase === 'streaming' && loadNotice === status.operationId
  const loadingNotice = noticeShown && status.modelLoading && !hasText
  const previewText = recording && (hasText || noticeShown) ? <p className="dictation-overlay__text">{loadingNotice ? loadingLabel : text.committed}<span>{text.tentative}</span></p> : null
  // Keep the canvas/context between recordings; hidden artwork has no clock.
  const artworkActive = active && visible
  const material = getInterfaceThemeDefinition(interfaceTheme).material
  const nativeBackdrop = useNativeBackdrop(demo ? previewRoot : root, material === 'glass' && artworkActive, '[data-native-backdrop-surface]')
  const opticsActive = artworkActive && !materialResizing && nativeBackdrop !== 'unavailable'
  const trackMaterialResize = (event: TransitionEvent<HTMLDivElement>, running: boolean) => {
    // React normalizes propertyName only for transitionend, not run/cancel.
    const property = event.nativeEvent.propertyName
    if (event.target !== event.currentTarget || !['width', 'height'].includes(property)) return
    if (running) resizing.current.add(property)
    else resizing.current.delete(property)
    setMaterialResizing(resizing.current.size > 0)
  }
  const materialAttributes = {
    'data-interface-theme': interfaceTheme,
    'data-interface-palette': interfacePalette,
    'data-material': material,
    'data-native-backdrop': nativeBackdrop,
    lang: locale,
    style: paletteStyle as CSSProperties,
    onTransitionRun: (event: TransitionEvent<HTMLDivElement>) => trackMaterialResize(event, true),
    onTransitionEnd: (event: TransitionEvent<HTMLDivElement>) => trackMaterialResize(event, false),
    onTransitionCancel: (event: TransitionEvent<HTMLDivElement>) => trackMaterialResize(event, false),
  }
  if (appearance.theme !== 'classic') {
    const expanded = Boolean(previewText)
    const fox = appearance.theme === 'pixels'
    const failed = status.phase === 'error' || status.phase === 'cancelled'
    const Icon = status.phase === 'completed' ? Check : failed ? X : recording ? Mic : LoaderCircle
    const close = () => { void cancel().catch(() => {}) }
    const end = () => { void finish?.().catch(() => {}) }
    const copyText = () => { setCopyFailure(null); void copy().catch(() => setCopyFailure(status.operationId)) }
    const visual = fox ? <DictationVisual appearance={appearance} phase={status.phase} levels={levels} still={still} active={artworkActive} demo={demo} operationId={status.operationId} /> : <>
      {recording ? <div className="dictation-overlay__levels dictation-wave-fallback" aria-hidden="true" style={{ color: dictationPaletteColors[appearance.palette] }}>
        {Array.from({ length: 8 }, (_, index) => <i key={index} style={{ height: `${Math.max(3, Math.min(23, (levels[index % Math.max(1, levels.length)] ?? 0) * 23))}px` }} />)}
      </div> : null}
      <Icon className="dictation-cloud__fallback" size={18} aria-hidden="true" />
    </>
    return <div {...materialAttributes} ref={root} data-native-backdrop-surface={expanded || error || undefined} hidden={!visible} className="dictation-overlay dictation-overlay--cloud" data-theme={appearance.theme} data-phase={status.phase} data-audio-progress={progress ? true : undefined} data-recording-control={recordingControl || undefined} data-expanded={expanded || undefined} data-reduced-motion={still || undefined} data-demo={demo || undefined}>
      <DictationCloudSurface appearance={appearance} material={material} accentColor={paletteStyle?.['--accent']} phase={status.phase} levels={levels} still={still} active={artworkActive && !error && (material !== 'glass' || !fox)} demo={demo} coreRef={core} effectRef={progress ? progressArt : undefined} expanded={expanded} singleControl controlsVisible={recording && recordingControl} />
      {material === 'glass' && (expanded || error) ? <IslandGlassOptic active={opticsActive} /> : null}
      {previewText}
      <div className="dictation-cloud__bar">
        <div ref={core} className="dictation-cloud__core" data-native-backdrop-surface={!expanded && !error || undefined}>
          {material === 'glass' && !expanded && !error ? <IslandGlassOptic active={opticsActive} /> : null}
          {progressTime ? <>
            <span ref={progressArt} className="dictation-cloud__progress-art">{visible ? visual : null}</span>
            {progressTime}
          </> : visible ? visual : null}
          {!recording && !error ? <button className="dictation-cloud__interaction" type="button" aria-label={failed || status.phase === 'completed' ? closeLabel : ru ? 'Отменить обработку' : 'Cancel processing'} title={label} onPointerDown={event => event.preventDefault()} onClick={close} /> : null}
        </div>
        <span role={error ? 'alert' : 'status'} className={error ? 'dictation-cloud__error-label' : 'dictation-overlay__sr'}>{message}</span>
        {error ? <>
          {status.text ? <button className="dictation-cloud__copy" type="button" aria-label={copyLabel} title={copyLabel} onPointerDown={event => event.preventDefault()} onClick={copyText}><Copy size={16} /></button> : null}
          <button className="dictation-cloud__dismiss" type="button" aria-label={closeLabel} title={closeLabel} onPointerDown={event => event.preventDefault()} onClick={close}><X size={15} /></button>
        </> : recordingControl ? <button className="dictation-cloud__satellite dictation-cloud__satellite--right" data-native-backdrop-surface={recording && !expanded || undefined} type="button" aria-label={ru ? 'Завершить запись' : 'Finish recording'} title={ru ? 'Завершить запись' : 'Finish recording'} disabled={!recording} aria-hidden={!recording} onPointerDown={event => event.preventDefault()} onClick={end}>{material === 'glass' ? <IslandGlassOptic active={opticsActive && recording} /> : null}<Stop weight="fill" size={13} /></button> : null}
      </div>
    </div>
  }
  if (!visible) return null
  return <div {...materialAttributes} ref={root} data-native-backdrop-surface className="dictation-overlay" data-theme={appearance.theme} data-phase={status.phase} data-expanded={Boolean(previewText) || undefined} data-reduced-motion={still || undefined} data-demo={demo || undefined}>
    {material === 'glass' ? <IslandGlassOptic active={opticsActive} /> : null}
    <div className="dictation-overlay__bar">
      <div className="dictation-overlay__art"><DictationVisual key={`${appearance.theme}:${status.operationId}:${status.phase}`} appearance={appearance} phase={status.phase} levels={levels} still={still} active={active} demo={demo} operationId={status.operationId} /></div>
      <span className="dictation-overlay__label"><span role={error ? 'alert' : 'status'}>{message}</span>{progressTime && <> {progressTime}</>}</span>
      {recording ? <div className="dictation-overlay__levels" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} style={{ height: `${Math.max(3, Math.min(23, (levels[index % Math.max(1, levels.length)] ?? 0) * 23))}px` }} />)}</div> : null}
      {status.phase === 'error' && status.text ? <button type="button" aria-label={ru ? 'Скопировать текст' : 'Copy text'} title={ru ? 'Скопировать текст' : 'Copy text'} onPointerDown={(event) => event.preventDefault()} onClick={() => { setCopyFailure(null); void copy().catch(() => setCopyFailure(status.operationId)) }}><Copy size={15} /></button> : null}
      {recording ? recordingControl ? <button type="button" aria-label={ru ? 'Завершить запись' : 'Finish recording'} onPointerDown={event => event.preventDefault()} onClick={() => { void finish?.().catch(() => {}) }}><Stop weight="fill" size={13} /></button> : null : <button type="button" aria-label={status.phase === 'transcribing' || status.phase === 'processing' ? ru ? 'Отменить обработку' : 'Cancel processing' : closeLabel} onPointerDown={event => event.preventDefault()} onClick={() => { void cancel().catch(() => {}) }}><X size={15} /></button>}
    </div>
    {previewText}
  </div>
}
