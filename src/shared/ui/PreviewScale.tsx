import './PreviewDimensions.css'
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { projectPreviewScale } from '../lib/previewSizing'
import './PreviewScale.css'
import { PreviewResizeHandle } from './PreviewResizeHandle'

export function PreviewScale({ value, min, max, step = 1, label, onCommit, children, backdrop, header, previewClassName = '', previewLabel }: {
  value: number; min: number; max: number; step?: number; label: string
  onCommit: (value: number) => void; children: (value: number) => ReactNode
  backdrop?: ReactNode; header?: ReactNode; previewClassName?: string; previewLabel?: string
}) {
  const body = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ id: number; x: number; y: number; width: number; height: number; initial: number; next: number } | null>(null)
  const [draft, setDraft] = useState<number | null>(null)
  const current = draft ?? value
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n / step) * step))
  const cancel = () => { gesture.current = null; setDraft(null) }
  const reset = () => { cancel(); onCommit(clamp(100)) }
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !body.current) return
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true })
    const rect = body.current.getBoundingClientRect()
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width: Math.max(1, rect.width), height: Math.max(1, rect.height), initial: value, next: value }
    setDraft(value); event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    g.next = clamp(projectPreviewScale(g.initial, event.clientX - g.x, event.clientY - g.y, g.width, g.height))
    setDraft(g.next)
  }
  const up = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.id !== event.pointerId) return
    const next = gesture.current.next
    cancel(); onCommit(next); event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); cancel(); return }
    const direction = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 0
    if (!direction && !['Home', 'End'].includes(event.key)) return
    event.preventDefault(); cancel()
    onCommit(clamp(event.key === 'Home' ? min : event.key === 'End' ? max : current + direction * step * (event.shiftKey ? 5 : 1)))
  }
  return <div className="preview-scale">
    <div className={`preview-scale__stage settings-preview ${previewClassName}`} role={previewLabel ? 'group' : undefined} aria-label={previewLabel}>
    {backdrop}{header}
    <div className="preview-scale__scene">
    <div ref={body} className="preview-scale__body">{children(current)}<PreviewResizeHandle role="slider" tabIndex={0} aria-label={label} title={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={current} aria-valuetext={`${current}%`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={key} onDoubleClick={reset} /></div>
    </div></div>
    <div className="preview-scale__value preview-dimensions"><span>{label} <output>{current}%</output></span></div>
  </div>
}
