import { RadioTower, RotateCcw } from '../../shared/ui/SettingsIcons'
import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { dragPosition } from './dragGeometry'
import { LayoutDragGhost } from './LayoutDragGhost'
import { captureLayoutDrag, type LayoutDragCapture, type LayoutDragFrame } from './dragGeometry'
import type { AppConfig, Locale } from '../../shared/lib/types'
import type { UsageSnapshot } from '../../shared/lib/usageTypes'
import { ISLAND_LAYOUT_ELEMENTS, canPlaceIslandElement, getIslandLayout, getLegacyIslandLayout, moveIslandElement, withIslandLayout, type IslandLayoutDropTarget, type IslandLayoutElement, type IslandLayout, type IslandLayoutZone } from '../../shared/lib/islandLayout'
import { IslandElementSample, IslandPreview } from './IslandPreview'
import './IslandLayoutEditor.css'

const names: Record<Locale, Record<IslandLayoutElement, string>> = {
  ru: { codex: 'Codex', claude: 'Claude', artwork: 'Обложка', previous: 'Предыдущий трек', next: 'Следующий трек', transport: 'Пуск и пауза', progress: 'Прогресс', like: 'Нравится', dislike: 'Не нравится', shuffle: 'Перемешать', repeat: 'Повтор', settings: 'Настройки', pin: 'Закрепить', microphone: 'Диктовка' },
  en: { codex: 'Codex', claude: 'Claude', artwork: 'Artwork', previous: 'Previous track', next: 'Next track', transport: 'Play and pause', progress: 'Progress', like: 'Like', dislike: 'Dislike', shuffle: 'Shuffle', repeat: 'Repeat', settings: 'Settings', pin: 'Pin', microphone: 'Dictation' },
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
  const pointerRef = useRef<LayoutDragCapture & { id: number; x: number; y: number; element: IslandLayoutElement } | null>(null)
  const dragRef = useRef<IslandLayoutElement | null>(null)
  const [dragging, setDragging] = useState<IslandLayoutElement | null>(null)
  const [over, setOver] = useState<Destination | null>(null)
  const [ghost, setGhost] = useState<LayoutDragFrame | null>(null)
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
      if (event.button !== 0 || !event.isPrimary) return
      event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId)
      pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, element,
        ...captureLayoutDrag(event.currentTarget, event.clientX, event.clientY) }
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const pointer = pointerRef.current
      if (!pointer || pointer.id !== event.pointerId || (!dragRef.current && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 6)) return
      dragRef.current = pointer.element; setDragging(pointer.element); setGhost({ ...dragPosition(pointer.grab, event.clientX, event.clientY), width: pointer.grab.width, height: pointer.grab.height, clone: pointer.clone, sourceWidth: pointer.sourceWidth, sourceHeight: pointer.sourceHeight }); setOver(destinationAt(event.clientX, event.clientY))
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
      const targets = (Object.keys(zones) as IslandLayoutDropTarget[]).filter((target) => canPlaceIslandElement(layout, element, target)).flatMap<Destination>((zone) => zone === 'catalog' ? [{ zone }] : Array.from({ length: layout.zones[zone].filter((item) => item !== element).length + 1 }, (_, index) => ({ zone, index })))
      const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
      const current = over ? targets.findIndex((target) => target.zone === over.zone && target.index === over.index) : -1
      const next = targets[current < 0 ? step > 0 ? 0 : targets.length - 1 : (current + step + targets.length) % targets.length]
      setOver(next); setAnnouncement(`${zones[next.zone]}${next.index == null ? '' : ` · ${next.index + 1}`}`)
    }
  }
  const elementView = (element: IslandLayoutElement, node: ReactNode, catalog = false) => {
    if (element === 'progress' && node == null) return dragging === 'progress'
      ? <div className="island-editor-progress-slot" role="group" aria-label={locale === 'ru' ? 'Место прогресса' : 'Progress position'} data-layout-target="player" data-over={over?.zone === 'player' || undefined} />
      : null
    const fixed = element === 'settings' || element === 'transport'
    return <div key={element} className={`island-editor-element${catalog ? ' island-editor-element--catalog' : ''}`} data-layout-element={element} data-protected={fixed || undefined} data-picked={dragging === element || undefined} draggable={false} {...(!fixed ? pointerHandlers(element) : {})} tabIndex={fixed ? undefined : 0} role={fixed ? 'img' : 'button'} aria-label={labels[element]} aria-pressed={fixed ? undefined : dragging === element} title={!fixed && catalog && ['like', 'dislike', 'shuffle', 'repeat'].includes(element) ? `${labels[element]} · ${['like', 'dislike'].includes(element) ? 'Direct Yandex' : locale === 'ru' ? 'зависит от плеера' : 'depends on player'}` : fixed ? `${labels[element]} · ${locale === 'ru' ? 'всегда на островке' : 'always on island'}` : labels[element]} onKeyDown={fixed ? undefined : (event) => keyboardDrag(event, element)}>
      {catalog && ['like', 'dislike', 'shuffle', 'repeat'].includes(element) ? <span className="island-editor-capability" role="img" aria-label={['like', 'dislike'].includes(element) ? locale === 'ru' ? 'Нужен Direct Yandex' : 'Requires Direct Yandex' : locale === 'ru' ? 'Зависит от выбранного плеера' : 'Depends on the selected player'} title={['like', 'dislike'].includes(element) ? locale === 'ru' ? 'Работает с Direct Yandex. Подключите его в разделе «Источник».' : 'Works with Direct Yandex. Connect it in Source settings.' : locale === 'ru' ? 'Команда должна поддерживаться выбранным плеером.' : 'The selected player must support this command.'}><RadioTower size={13} /></span> : null}
      <div className="island-editor-element__visual" inert aria-hidden="true">{node}</div>
    </div>
  }
  const zoneView = (zone: IslandLayoutZone, node: ReactNode) => <div className={`island-editor-zone island-editor-zone--${zone}`} role="group" aria-label={zones[zone]} data-layout-target={zone} data-ready={Boolean(dragging && canPlaceIslandElement(layout, dragging, zone)) || undefined} data-over={over?.zone === zone || undefined}>{node}</div>
  const reset = () => {
    const defaults = getLegacyIslandLayout(config)
    commit({ ...defaults, zones: { ...defaults.zones, player: [...ISLAND_LAYOUT_ELEMENTS.player], actions: ['settings', 'pin'] } })
  }
  return <section ref={editorRef} className="island-layout-editor" data-dragging={Boolean(dragging) || undefined}>
    <header className="island-layout-editor__header"><div>{showHeading ? <h3>{locale === 'ru' ? 'Ваш островок' : 'Your island'}</h3> : null}<p>{locale === 'ru' ? 'Перетаскивайте элементы. Тяните за край, чтобы изменить ширину, за угол — масштаб.' : 'Drag elements. Resize the width from an edge and the scale from a corner.'}</p></div><button type="button" className="island-layout-editor__reset" aria-label={locale === 'ru' ? 'Сбросить настройки островка' : 'Reset island settings'} title={locale === 'ru' ? 'Сбросить' : 'Reset'} onClick={onReset ?? reset}><RotateCcw size={15} /></button></header>
    <IslandPreview active={active} config={config} label={locale === 'ru' ? 'Редактируемый островок' : 'Editable island'} usage={usage} renderElement={elementView} renderZone={zoneView} onResize={(dimensions) => onChange({ ...config, layout: { ...config.layout, ...dimensions, size: 'medium' } })} />
    <div className="island-layout-catalog" role="group" aria-label={zones.catalog} data-layout-target="catalog" data-ready={Boolean(dragging && canPlaceIslandElement(layout, dragging, 'catalog')) || undefined} data-over={over?.zone === 'catalog' || undefined}>
      <h4>{dragging ? locale === 'ru' ? 'Перетащите сюда, чтобы убрать' : 'Drop here to remove' : locale === 'ru' ? 'Добавить в островок' : 'Add to island'}</h4>
      <div className="island-layout-catalog__items island-root">{available.map((element) => elementView(element, <IslandElementSample element={element} usage={usage} locale={locale} />, true))}{available.length === 0 ? <span className="island-layout-catalog__empty">{locale === 'ru' ? 'Все элементы добавлены' : 'All elements added'}</span> : null}</div>
    </div>
    <span className="island-layout-editor__announcement" aria-live="polite">{announcement}</span>
    {ghost && dragging ? <LayoutDragGhost ghost={ghost} /> : null}
  </section>
}
