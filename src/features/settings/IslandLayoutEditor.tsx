import { RotateCcw } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { DragEvent, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import type { AppConfig, Locale } from '../../shared/lib/types'
import type { UsageSnapshot } from '../../shared/lib/usageTypes'
import { ISLAND_LAYOUT_ELEMENTS, canPlaceIslandElement, getIslandLayout, getLegacyIslandLayout, moveIslandElement, withIslandLayout, type IslandLayoutDropTarget, type IslandLayoutElement, type IslandLayout, type IslandLayoutZone } from '../../shared/lib/islandLayout'
import { IslandElementSample, IslandPreview } from './IslandPreview'
import './IslandLayoutEditor.css'

const DRAG_TYPE = 'application/x-music-island-layout-element'
const names: Record<Locale, Record<IslandLayoutElement, string>> = {
  ru: { codex: 'Codex', claude: 'Claude', artwork: 'Обложка', previous: 'Предыдущий трек', next: 'Следующий трек', transport: 'Пуск и пауза', progress: 'Прогресс', like: 'Нравится', dislike: 'Не нравится', shuffle: 'Перемешать', repeat: 'Повтор', settings: 'Настройки', pin: 'Закрепить' },
  en: { codex: 'Codex', claude: 'Claude', artwork: 'Artwork', previous: 'Previous track', next: 'Next track', transport: 'Play and pause', progress: 'Progress', like: 'Like', dislike: 'Dislike', shuffle: 'Shuffle', repeat: 'Repeat', settings: 'Settings', pin: 'Pin' },
}
const zoneNames = {
  ru: { left: 'Слева от островка', right: 'Справа от островка', player: 'Управление музыкой', reactionLeft: 'Слева от прогресса', reactionRight: 'Справа от прогресса', actions: 'Действия', catalog: 'Доступные элементы' },
  en: { left: 'Left of island', right: 'Right of island', player: 'Music controls', reactionLeft: 'Left of progress', reactionRight: 'Right of progress', actions: 'Actions', catalog: 'Available elements' },
}
const allElements = [...ISLAND_LAYOUT_ELEMENTS.providers, ...ISLAND_LAYOUT_ELEMENTS.player, ...ISLAND_LAYOUT_ELEMENTS.reactions, ...ISLAND_LAYOUT_ELEMENTS.actions]
type Destination = { zone: IslandLayoutDropTarget; index?: number }

export interface IslandLayoutEditorProps {
  config: AppConfig
  onChange: (config: AppConfig) => void
  usage?: UsageSnapshot | null
  /** Legacy story callers may supply this; the editor always renders the production scene. */
  preview?: ReactNode
  onReset?: () => void
  showHeading?: boolean
  active?: boolean
}

export function IslandLayoutEditor({ config, onChange, usage, onReset, showHeading = true, active = true }: IslandLayoutEditorProps) {
  const locale: Locale = config.appearance.locale === 'en' ? 'en' : 'ru'
  const labels = names[locale]
  const zones = zoneNames[locale]
  const layout = useMemo(() => getIslandLayout(config), [config])
  const editorRef = useRef<HTMLElement>(null)
  const pointerRef = useRef<{ id: number; x: number; y: number; element: IslandLayoutElement } | null>(null)
  const dragRef = useRef<IslandLayoutElement | null>(null)
  const [dragging, setDragging] = useState<IslandLayoutElement | null>(null)
  const [over, setOver] = useState<Destination | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const placed = Object.values(layout.zones).flat() as IslandLayoutElement[]
  const available = allElements.filter((element) => !placed.includes(element))
  const endDrag = () => { dragRef.current = null; pointerRef.current = null; setDragging(null); setGhost(null); setOver(null) }
  const commit = (next: IslandLayout) => { onChange(withIslandLayout(config, next)); setAnnouncement(locale === 'ru' ? 'Расположение обновлено' : 'Layout updated') }
  const place = (element: IslandLayoutElement, destination: Destination) => commit(moveIslandElement(layout, element, destination.zone, destination.index))

  const destinationAt = (x: number, y: number): Destination | null => {
    const zoneNode = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-layout-target]')
    if (!zoneNode || !editorRef.current?.contains(zoneNode) || !dragRef.current) return null
    const zone = zoneNode.dataset.layoutTarget as IslandLayoutDropTarget
    if (!canPlaceIslandElement(layout, dragRef.current, zone)) return null
    if (zone === 'catalog') return { zone }
    const nodes = Array.from(zoneNode.querySelectorAll<HTMLElement>('[data-layout-element]')).filter((node) => node.dataset.layoutElement !== dragRef.current)
    const before = nodes.find((node) => { const rect = node.getBoundingClientRect(); return zone === 'actions' ? y < rect.top + rect.height / 2 : x < rect.left + rect.width / 2 })
    const values = (layout.zones[zone] as IslandLayoutElement[]).filter((item) => item !== dragRef.current)
    return { zone, index: before ? values.indexOf(before.dataset.layoutElement as IslandLayoutElement) : values.length }
  }
  const pointerHandlers = (element: IslandLayoutElement) => ({
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId)
      pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, element }
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current
      if (!pointer || pointer.id !== event.pointerId || (!dragRef.current && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 6)) return
      dragRef.current = pointer.element; setDragging(pointer.element); setGhost({ x: event.clientX, y: event.clientY }); setOver(destinationAt(event.clientX, event.clientY))
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      if (pointerRef.current?.id !== event.pointerId) return
      const destination = destinationAt(event.clientX, event.clientY)
      if (destination && dragRef.current) place(dragRef.current, destination)
      event.currentTarget.releasePointerCapture(event.pointerId); endDrag()
    },
    onPointerCancel: endDrag, onLostPointerCapture: endDrag,
  })
  const keyboardDrag = (event: KeyboardEvent, element: IslandLayoutElement) => {
    if (event.key === 'Escape') { event.preventDefault(); endDrag(); return }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (dragging === element && over) { place(element, over); endDrag() }
      else { dragRef.current = element; setDragging(element); setOver(null); setAnnouncement(locale === 'ru' ? 'Стрелки — выбрать место, Enter — перенести, Escape — отменить.' : 'Arrows choose a place, Enter drops, Escape cancels.') }
    }
    if (dragging === element && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault()
      const targets = (Object.keys(zones) as IslandLayoutDropTarget[]).filter((target) => canPlaceIslandElement(layout, element, target))
      const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
      const next = targets[((over ? targets.indexOf(over.zone) : -1) + step + targets.length) % targets.length]
      setOver({ zone: next }); setAnnouncement(zones[next])
    }
  }
  const nativeStart = (event: DragEvent, element: IslandLayoutElement) => {
    if (pointerRef.current) { event.preventDefault(); return }
    event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(DRAG_TYPE, element); event.dataTransfer.setData('text/plain', element)
    dragRef.current = element; requestAnimationFrame(() => { if (dragRef.current === element) setDragging(element) })
  }
  const dropHandlers = (zone: IslandLayoutDropTarget) => ({
    onDragOver: (event: DragEvent) => { if (dragRef.current && canPlaceIslandElement(layout, dragRef.current, zone)) { event.preventDefault(); setOver(destinationAt(event.clientX, event.clientY) ?? { zone }) } },
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      const raw = event.dataTransfer.getData(DRAG_TYPE) || dragRef.current
      if (raw && allElements.includes(raw as IslandLayoutElement)) place(raw as IslandLayoutElement, destinationAt(event.clientX, event.clientY) ?? { zone })
      endDrag()
    },
  })
  const elementView = (element: IslandLayoutElement, node: ReactNode, catalog = false) => {
    if (element === 'progress' && node == null) return dragging === 'progress'
      ? <div className="island-editor-progress-slot" aria-label={locale === 'ru' ? 'Место прогресса' : 'Progress position'} data-layout-target="player" data-over={over?.zone === 'player' || undefined} {...dropHandlers('player')} />
      : null
    const fixed = element === 'settings' || element === 'transport'
    return <div key={element} className={`island-editor-element${catalog ? ' island-editor-element--catalog' : ''}`} data-layout-element={element} data-protected={fixed || undefined} data-picked={dragging === element || undefined} draggable={!fixed} {...(!fixed ? pointerHandlers(element) : {})} onDragStart={(event) => nativeStart(event, element)} onDragEnd={endDrag} tabIndex={fixed ? undefined : 0} role={fixed ? 'img' : 'button'} aria-label={labels[element]} aria-pressed={fixed ? undefined : dragging === element} title={fixed ? `${labels[element]} · ${locale === 'ru' ? 'всегда на островке' : 'always on island'}` : labels[element]} onKeyDown={fixed ? undefined : (event) => keyboardDrag(event, element)}>
      <div className="island-editor-element__visual" inert aria-hidden="true">{node}</div>
    </div>
  }
  const zoneView = (zone: IslandLayoutZone, node: ReactNode) => <div className={`island-editor-zone island-editor-zone--${zone}`} aria-label={zones[zone]} data-layout-target={zone} data-ready={Boolean(dragging && canPlaceIslandElement(layout, dragging, zone)) || undefined} data-over={over?.zone === zone || undefined} {...dropHandlers(zone)}>{node}</div>
  const reset = () => {
    const defaults = getLegacyIslandLayout(config)
    commit({ ...defaults, zones: { ...defaults.zones, player: [...ISLAND_LAYOUT_ELEMENTS.player], actions: [...ISLAND_LAYOUT_ELEMENTS.actions] } })
  }
  return <section ref={editorRef} className="island-layout-editor" data-dragging={Boolean(dragging) || undefined}>
    <header className="island-layout-editor__header"><div>{showHeading ? <h3>{locale === 'ru' ? 'Ваш островок' : 'Your island'}</h3> : null}<p>{locale === 'ru' ? 'Перетаскивайте элементы. Тяните за край, чтобы изменить ширину, за угол — масштаб.' : 'Drag elements. Resize the width from an edge and the scale from a corner.'}</p></div><button type="button" className="island-layout-editor__reset" aria-label={locale === 'ru' ? 'Сбросить настройки островка' : 'Reset island settings'} title={locale === 'ru' ? 'Сбросить' : 'Reset'} onClick={onReset ?? reset}><RotateCcw size={15} /></button></header>
    <IslandPreview active={active} config={config} label={locale === 'ru' ? 'Редактируемый островок' : 'Editable island'} usage={usage} renderElement={elementView} renderZone={zoneView} onResize={(dimensions) => onChange({ ...config, layout: { ...config.layout, ...dimensions, size: 'medium' } })} />
    <div className="island-layout-catalog" aria-label={zones.catalog} data-layout-target="catalog" data-over={over?.zone === 'catalog' || undefined} {...dropHandlers('catalog')}>
      <h4>{dragging ? locale === 'ru' ? 'Перетащите сюда, чтобы убрать' : 'Drop here to remove' : locale === 'ru' ? 'Добавить в островок' : 'Add to island'}</h4>
      <div className="island-layout-catalog__items island-root">{available.map((element) => elementView(element, <IslandElementSample element={element} usage={usage} locale={locale} />, true))}{available.length === 0 ? <span className="island-layout-catalog__empty">{locale === 'ru' ? 'Все элементы добавлены' : 'All elements added'}</span> : null}</div>
    </div>
    <span className="island-layout-editor__announcement" aria-live="polite">{announcement}</span>
    {ghost && dragging ? <div className="island-layout-drag-ghost island-root" aria-hidden="true" style={{ left: ghost.x, top: ghost.y }}><IslandElementSample element={dragging} usage={usage} locale={locale} /></div> : null}
  </section>
}
