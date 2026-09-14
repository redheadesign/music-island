import { RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import type { AppConfig } from '../../shared/lib/types'
import { DEFAULT_TASKBAR_ELEMENTS, TASKBAR_ELEMENTS, TASKBAR_ELEMENT_LABELS, getTaskbarLayout, normalizeTaskbarLayout, withTaskbarLayout, type TaskbarElement } from '../../shared/lib/taskbarLayout'
import { WarpMaterial } from '../../shared/ui/WarpMaterial'
import { TaskbarControl, TaskbarPlayer } from '../taskbar/TaskbarPlayer'
import { APPEARANCE_PREVIEW_MEDIA as media } from './previewMedia'
import './IslandLayoutEditor.css'
import './TaskbarLayoutEditor.css'

const DRAG_TYPE = 'application/x-music-island-taskbar-element'
type Destination = { zone: 'controls' | 'catalog'; index?: number }

export function TaskbarLayoutEditor({ config, onChange, active = true }: { config: AppConfig; onChange: (config: AppConfig) => void; active?: boolean }) {
  const locale = config.appearance.locale === 'en' ? 'en' : 'ru'
  const ru = locale === 'ru'
  const layout = getTaskbarLayout(config)
  const root = useRef<HTMLElement>(null)
  const pointer = useRef<{ id: number; x: number; y: number; element: TaskbarElement } | null>(null)
  const picked = useRef<TaskbarElement | null>(null)
  const [dragging, setDragging] = useState<TaskbarElement | null>(null)
  const [over, setOver] = useState<Destination | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const available = TASKBAR_ELEMENTS.filter((element) => !layout.elements.includes(element))
  const finish = () => { pointer.current = null; picked.current = null; setDragging(null); setOver(null); setGhost(null) }
  const place = (element: TaskbarElement, destination: Destination) => {
    if (element === 'transport' && destination.zone === 'catalog') return
    const elements = layout.elements.filter((value) => value !== element)
    if (destination.zone === 'controls') elements.splice(destination.index ?? elements.length, 0, element)
    onChange(withTaskbarLayout(config, normalizeTaskbarLayout({ elements })))
    setAnnouncement(ru ? 'Расположение обновлено' : 'Layout updated')
  }
  const destinationAt = (x: number, y: number): Destination | null => {
    const node = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-taskbar-target]')
    if (!node || !root.current?.contains(node) || !picked.current) return null
    const zone = node.dataset.taskbarTarget as Destination['zone']
    if (zone === 'catalog') return picked.current === 'transport' ? null : { zone }
    const elements = layout.elements.filter((element) => element !== picked.current)
    const before = Array.from(node.querySelectorAll<HTMLElement>('[data-taskbar-element]')).find((element) => element.dataset.taskbarElement !== picked.current && x < element.getBoundingClientRect().left + element.getBoundingClientRect().width / 2)
    return { zone, index: before ? elements.indexOf(before.dataset.taskbarElement as TaskbarElement) : elements.length }
  }
  const pointerHandlers = (element: TaskbarElement) => ({
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId)
      pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, element }
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const current = pointer.current
      if (!current || current.id !== event.pointerId || (!picked.current && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6)) return
      picked.current = current.element; setDragging(current.element); setGhost({ x: event.clientX, y: event.clientY }); setOver(destinationAt(event.clientX, event.clientY))
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      if (pointer.current?.id !== event.pointerId) return
      const destination = destinationAt(event.clientX, event.clientY)
      if (destination && picked.current) place(picked.current, destination)
      finish(); event.currentTarget.releasePointerCapture(event.pointerId)
    },
    onPointerCancel: finish, onLostPointerCapture: finish,
  })
  const keyboard = (event: KeyboardEvent, element: TaskbarElement) => {
    if (event.key === 'Escape') { event.preventDefault(); finish(); return }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (picked.current === element && over) { place(element, over); finish() }
      else { picked.current = element; setDragging(element); setOver({ zone: 'controls', index: Math.max(0, layout.elements.indexOf(element)) }); setAnnouncement(ru ? 'Стрелки — место, вниз — убрать, Enter — перенести, Escape — отменить.' : 'Arrows choose position, down removes, Enter drops, Escape cancels.') }
    }
    if (picked.current !== element || !event.key.startsWith('Arrow')) return
    event.preventDefault()
    if (event.key === 'ArrowDown' && element !== 'transport') setOver({ zone: 'catalog' })
    else {
      const max = layout.elements.filter((value) => value !== element).length
      const index = event.key === 'ArrowUp' ? 0 : Math.min(max, Math.max(0, (over?.index ?? 0) + (event.key === 'ArrowLeft' ? -1 : 1)))
      setOver({ zone: 'controls', index }); setAnnouncement(`${ru ? 'Позиция' : 'Position'} ${index + 1}`)
    }
  }
  const dropHandlers = (zone: Destination['zone']) => ({
    onDragOver: (event: DragEvent) => {
      if (!picked.current || (zone === 'catalog' && picked.current === 'transport')) return
      event.preventDefault(); setOver(destinationAt(event.clientX, event.clientY) ?? { zone })
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      const element = event.dataTransfer.getData(DRAG_TYPE) || picked.current
      if (TASKBAR_ELEMENTS.includes(element as TaskbarElement)) place(element as TaskbarElement, destinationAt(event.clientX, event.clientY) ?? { zone })
      finish()
    },
  })
  const sample = (element: TaskbarElement) => <div className="taskbar-player taskbar-control-sample"><TaskbarControl element={element} snapshot={media} locale={locale} onCommand={() => undefined} /></div>
  const view = (element: TaskbarElement, node: ReactNode, catalog = false) => <div key={element} className={`taskbar-editor-element${catalog ? ' taskbar-editor-element--catalog' : ''}`} data-taskbar-element={element} data-picked={dragging === element || undefined} data-insert={over?.zone === 'controls' && layout.elements.filter((value) => value !== dragging)[over.index ?? -1] === element || undefined} role="button" tabIndex={0} aria-label={TASKBAR_ELEMENT_LABELS[locale][element]} aria-pressed={dragging === element} title={TASKBAR_ELEMENT_LABELS[locale][element]} draggable {...pointerHandlers(element)} onKeyDown={(event) => keyboard(event, element)} onDragStart={(event) => {
    if (pointer.current) { event.preventDefault(); return }
    event.dataTransfer.setData(DRAG_TYPE, element); event.dataTransfer.effectAllowed = 'move'; picked.current = element; setDragging(element)
  }} onDragEnd={finish}><div className="taskbar-editor-element__visual" inert aria-hidden="true">{node}</div></div>
  return <section ref={root} className="taskbar-layout-editor" aria-label={ru ? 'Редактор мини-плеера' : 'Mini-player editor'} data-dragging={Boolean(dragging) || undefined}>
    <header className="island-layout-editor__header"><p className="taskbar-layout-editor__hint">{ru ? 'Перетаскивайте элементы прямо в превью.' : 'Drag the elements directly in the preview.'}</p><button type="button" className="island-layout-editor__reset" aria-label={ru ? 'Сбросить состав мини-плеера' : 'Reset mini-player layout'} onClick={() => onChange(withTaskbarLayout(config, normalizeTaskbarLayout({ elements: DEFAULT_TASKBAR_ELEMENTS })))}><RotateCcw size={15} /></button></header>
    <div className="taskbar-preview taskbar-preview--editable" aria-label={ru ? 'Превью мини-плеера в панели задач' : 'Taskbar mini-player preview'}>
      {active ? <WarpMaterial className="taskbar-preview__material" speed={0.225} reducedMotion={config.appearance.reducedMotion} /> : null}
      <div className="taskbar-preview__bar">
        <div className="taskbar-editor-controls" data-taskbar-target="controls" data-over={over?.zone === 'controls' || undefined} {...dropHandlers('controls')}>
          <TaskbarPlayer snapshot={media} locale={locale} layout={layout} scale={config.taskbar?.scale ?? 1} onCommand={() => undefined} renderElement={view} reducedMotion />
        </div>
      </div>
    </div>
    <div className="island-layout-catalog" data-taskbar-target="catalog" data-over={over?.zone === 'catalog' || undefined} aria-label={ru ? 'Доступные элементы мини-плеера' : 'Available mini-player elements'} {...dropHandlers('catalog')}>
      <h4>{dragging ? ru ? 'Перетащите сюда, чтобы убрать' : 'Drop here to remove' : ru ? 'Добавить в мини-плеер' : 'Add to mini-player'}</h4>
      <div className="taskbar-layout-catalog__items">{available.map((element) => view(element, sample(element), true))}{!available.length ? <span className="island-layout-catalog__empty">{ru ? 'Все элементы добавлены' : 'All elements added'}</span> : null}</div>
    </div>
    <span className="island-layout-editor__announcement" aria-live="polite">{announcement}</span>
    {ghost && dragging ? <div className="taskbar-layout-drag-ghost" aria-hidden="true" style={{ left: ghost.x, top: ghost.y }}>{sample(dragging)}</div> : null}
  </section>
}
