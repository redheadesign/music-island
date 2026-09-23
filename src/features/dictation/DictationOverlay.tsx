import { useState } from 'react'
import { Check, Copy, LoaderCircle, Mic, X } from '../../shared/ui/SettingsIcons'
import { useDictationOverlay } from '../../app/useIslandApp'
import type { DictationStatus } from '../../shared/lib/dictationTypes'
import './dictation.css'
export function DictationOverlay() { return <DictationOverlayView {...useDictationOverlay()} /> }
export function DictationOverlayView({ status, visible, levels, text, locale = 'ru', reducedMotion, cancel, copy }: {
  status: DictationStatus; visible: boolean; levels: number[]; text: { committed: string; tentative: string }; locale?: 'ru' | 'en'; reducedMotion?: boolean; cancel: () => Promise<unknown>; copy: () => Promise<unknown>
}) {
  const [copyFailure, setCopyFailure] = useState<number | null>(null)
  const ru = locale === 'ru'
  const recording = status.phase === 'recording' || status.phase === 'streaming'
  const labels: Record<string, [string, string]> = { preparing: ['Подготовка…', 'Preparing…'], recording: ['Слушаю', 'Listening'], streaming: ['Слушаю', 'Listening'], transcribing: ['Распознаю…', 'Transcribing…'], processing: ['Обработка с ИИ…', 'Processing with AI…'], completed: ['Готово', 'Done'], cancelled: ['Запись отменена', 'Cancelled'], error: [status.text ? 'Не удалось вставить' : 'Не удалось распознать', status.text ? 'Could not paste' : 'Transcription failed'] }
  const label = labels[status.phase]?.[ru ? 0 : 1] ?? ''
  if (!visible) return null
  return <div className="dictation-overlay" data-reduced-motion={reducedMotion || undefined}>
    <div className="dictation-overlay__bar" role="status">
      {recording ? <Mic size={17} /> : status.phase === 'completed' ? <Check size={17} /> : ['cancelled', 'error'].includes(status.phase) ? <X size={17} /> : <LoaderCircle size={17} className="dictation-overlay__spinner" />}
      <span>{copyFailure === status.operationId ? ru ? 'Не удалось скопировать' : 'Could not copy' : label}</span>
      {recording ? <div className="dictation-overlay__levels" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} style={{ height: `${Math.max(3, Math.min(23, (levels[index % Math.max(1, levels.length)] ?? 0) * 23))}px` }} />)}</div> : null}
      {status.phase === 'error' && status.text ? <button type="button" aria-label={ru ? 'Скопировать текст' : 'Copy text'} title={ru ? 'Скопировать текст' : 'Copy text'} onPointerDown={(event) => event.preventDefault()} onClick={() => { setCopyFailure(null); void copy().catch(() => setCopyFailure(status.operationId)) }}><Copy size={15} /></button> : null}
      <button type="button" aria-label={recording ? ru ? 'Отменить запись' : 'Cancel recording' : ru ? 'Закрыть' : 'Dismiss'} onPointerDown={(event) => event.preventDefault()} onClick={() => { void cancel().catch(() => {}) }}><X size={15} /></button>
    </div>
    {recording && (text.committed || text.tentative) ? <p className="dictation-overlay__text">{text.committed}<span>{text.tentative}</span></p> : null}
  </div>
}
