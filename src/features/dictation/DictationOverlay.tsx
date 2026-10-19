import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Check, Copy, LoaderCircle, Mic, Stop, X } from '../../shared/ui/SettingsIcons'
import { useDictationOverlay } from '../../app/useIslandApp'
import type { DictationStatus } from '../../shared/lib/dictationTypes'
import { defaultDictationAppearance, type DictationAppearance } from '../../shared/lib/dictationAppearance'
import { DictationVisual } from './DictationVisual'
import { DictationCloudSurface } from './DictationCloudSurface'
import './dictation.css'
export function DictationOverlay() { return <DictationOverlayView {...useDictationOverlay()} /> }
export function DictationOverlayView({ status, visible, levels, text, locale = 'ru', reducedMotion, appearance = defaultDictationAppearance, active = true, demo = false, finish, cancel, copy }: {
  status: DictationStatus; visible: boolean; levels: number[]; text: { committed: string; tentative: string }; locale?: 'ru' | 'en'; reducedMotion?: boolean; cancel: () => Promise<unknown>; copy: () => Promise<unknown>
  appearance?: DictationAppearance; active?: boolean; demo?: boolean
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
  const systemReducedMotion = useReducedMotion()
  const still = Boolean(reducedMotion || systemReducedMotion || !active)
  const ru = locale === 'ru'
  const recording = status.phase === 'recording' || status.phase === 'streaming'
  const recordingControl = status.shortcutActivation !== 'push_to_talk'
  const labels: Record<string, [string, string]> = { preparing: ['Подготовка…', 'Preparing…'], recording: ['Слушаю', 'Listening'], streaming: ['Слушаю', 'Listening'], transcribing: ['Распознаю…', 'Transcribing…'], processing: ['Обработка с ИИ…', 'Processing with AI…'], completed: ['Готово', 'Done'], cancelled: ['Запись отменена', 'Cancelled'], error: [status.text ? 'Не удалось вставить' : 'Не удалось распознать', status.text ? 'Could not paste' : 'Transcription failed'] }
  const loadingLabel = ru ? 'Загружаю модель…' : 'Loading model…'
  const label = status.phase === 'transcribing' && status.modelLoading ? loadingLabel : labels[status.phase]?.[ru ? 0 : 1] ?? ''
  const hasText = Boolean(text.committed || text.tentative)
  const noticeShown = status.phase === 'streaming' && loadNotice === status.operationId
  const loadingNotice = noticeShown && status.modelLoading && !hasText
  const previewText = recording && (hasText || noticeShown) ? <p className="dictation-overlay__text">{loadingNotice ? loadingLabel : text.committed}<span>{text.tentative}</span></p> : null
  // Keep the canvas/context between recordings; hidden artwork has no clock.
  const artworkActive = active && visible
  if (appearance.theme !== 'classic') {
    const expanded = Boolean(previewText)
    const fox = appearance.theme === 'pixels'
    const failed = status.phase === 'error' || status.phase === 'cancelled'
    const Icon = status.phase === 'completed' ? Check : failed ? X : recording ? Mic : LoaderCircle
    const close = () => { void cancel().catch(() => {}) }
    const end = () => { void finish?.().catch(() => {}) }
    const copyText = () => { setCopyFailure(null); void copy().catch(() => setCopyFailure(status.operationId)) }
    const visual = fox ? <DictationVisual appearance={appearance} phase={status.phase} levels={levels} still={still} active={artworkActive} demo={demo} operationId={status.operationId} /> : <Icon className="dictation-cloud__fallback" size={18} aria-hidden="true" />
    return <div hidden={!visible} className="dictation-overlay dictation-overlay--cloud" data-theme={appearance.theme} data-phase={status.phase} data-recording-control={recordingControl || undefined} data-expanded={expanded || undefined} data-reduced-motion={still || undefined} data-demo={demo || undefined}>
      <DictationCloudSurface appearance={appearance} phase={status.phase} levels={levels} still={still} active={artworkActive} demo={demo} coreRef={core} expanded={expanded} singleControl />
      {previewText}
      <div className="dictation-cloud__bar" role="status">
        <span className="dictation-overlay__sr">{copyFailure === status.operationId ? ru ? 'Не удалось скопировать' : 'Could not copy' : label}</span>
        <div ref={core} className="dictation-cloud__core">
          {visible ? visual : null}
          {!recording ? <button className="dictation-cloud__interaction" type="button" aria-label={failed || status.phase === 'completed' ? ru ? 'Закрыть' : 'Dismiss' : ru ? 'Отменить обработку' : 'Cancel processing'} title={label} onPointerDown={event => event.preventDefault()} onClick={close} /> : null}
        </div>
        {status.phase === 'error' && status.text ? <button className="dictation-cloud__copy" type="button" aria-label={ru ? 'Скопировать текст' : 'Copy text'} title={ru ? 'Скопировать текст' : 'Copy text'} onPointerDown={event => event.preventDefault()} onClick={copyText}><Copy size={16} /></button> : recordingControl ? <button className="dictation-cloud__satellite dictation-cloud__satellite--right" type="button" aria-label={ru ? 'Завершить запись' : 'Finish recording'} title={ru ? 'Завершить запись' : 'Finish recording'} disabled={!recording} aria-hidden={!recording} onPointerDown={event => event.preventDefault()} onClick={end}><Stop weight="fill" size={13} /></button> : null}
      </div>
    </div>
  }
  if (!visible) return null
  return <div className="dictation-overlay" data-theme={appearance.theme} data-phase={status.phase} data-expanded={Boolean(previewText) || undefined} data-reduced-motion={still || undefined} data-demo={demo || undefined}>
    <div className="dictation-overlay__bar" role="status">
      <div className="dictation-overlay__art"><DictationVisual key={`${appearance.theme}:${status.operationId}:${status.phase}`} appearance={appearance} phase={status.phase} levels={levels} still={still} active={active} demo={demo} operationId={status.operationId} /></div>
      <span className={appearance.theme !== 'classic' && !['completed', 'error', 'cancelled'].includes(status.phase) ? 'dictation-overlay__sr' : 'dictation-overlay__label'}>{copyFailure === status.operationId ? ru ? 'Не удалось скопировать' : 'Could not copy' : label}</span>
      {recording ? <div className="dictation-overlay__levels" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} style={{ height: `${Math.max(3, Math.min(23, (levels[index % Math.max(1, levels.length)] ?? 0) * 23))}px` }} />)}</div> : null}
      {status.phase === 'error' && status.text ? <button type="button" aria-label={ru ? 'Скопировать текст' : 'Copy text'} title={ru ? 'Скопировать текст' : 'Copy text'} onPointerDown={(event) => event.preventDefault()} onClick={() => { setCopyFailure(null); void copy().catch(() => setCopyFailure(status.operationId)) }}><Copy size={15} /></button> : null}
      {recording ? recordingControl ? <button type="button" aria-label={ru ? 'Завершить запись' : 'Finish recording'} onPointerDown={event => event.preventDefault()} onClick={() => { void finish?.().catch(() => {}) }}><Stop weight="fill" size={13} /></button> : null : <button type="button" aria-label={ru ? 'Закрыть' : 'Dismiss'} onPointerDown={event => event.preventDefault()} onClick={() => { void cancel().catch(() => {}) }}><X size={15} /></button>}
    </div>
    {previewText}
  </div>
}
