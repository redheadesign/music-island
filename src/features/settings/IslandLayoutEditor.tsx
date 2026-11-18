import { RotateCcw } from '../../shared/ui/SettingsIcons'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { dragPosition } from './dragGeometry'
import { LayoutDragGhost } from './LayoutDragGhost'
import { captureLayoutDrag, type LayoutDragCapture, type LayoutDragFrame } from './dragGeometry'
import type { AppConfig, Locale } from '../../shared/lib/types'
import type { UsageSnapshot } from '../../shared/lib/usageTypes'
import { islandArrangement, ISLAND_LAYOUT_ELEMENTS, canPlaceIslandElement, getIslandLayout, getLegacyIslandLayout, isIslandCatalog, isIslandWidget, moveIslandElement, withIslandLayout, type IslandLayoutDropTarget, type IslandLayoutElement, type IslandLayout, type IslandLayoutZone } from '../../shared/lib/islandLayout'
import { createTranslator } from '../../shared/i18n/messages'
import { getInterfacePalette, getInterfaceTheme, getReducedTransparency, withUiPrefs } from '../../shared/lib/uiPrefs'
import { IslandElementSample, IslandPreview } from './IslandPreview'
import './IslandLayoutEditor.css'

const names: Record<Locale, Record<Exclude<IslandLayoutElement, 'localServers'>, string>> = {
  ru: { codex: 'Codex', claude: 'Claude', artwork: 'Обложка', previous: 'Предыдущий трек', next: 'Следующий трек', transport: 'Пуск и пауза', progress: 'Прогресс', seekBack: 'Назад на 10 секунд', seekForward: 'Вперёд на 10 секунд', volume: 'Системная громкость', like: 'Нравится', dislike: 'Не нравится', shuffle: 'Перемешать', repeat: 'Повтор', settings: 'Настройки', pin: 'Закрепить', microphone: 'Диктовка' },
  en: { codex: 'Codex', claude: 'Claude', artwork: 'Artwork', previous: 'Previous track', next: 'Next track', transport: 'Play and pause', progress: 'Progress', seekBack: 'Back 10 seconds', seekForward: 'Forward 10 seconds', volume: 'System volume', like: 'Like', dislike: 'Dislike', shuffle: 'Shuffle', repeat: 'Repeat', settings: 'Settings', pin: 'Pin', microphone: 'Dictation' },
}
const zoneNames = {
  ru: { left: 'Слева от островка', right: 'Справа от островка', player: 'Верхний ряд', playerLower: 'Нижний ряд', actions: 'Действия', bottom: 'Под островком', catalog: 'Элементы островка', widgetCatalog: 'Внешние виджеты' },
  en: { left: 'Left of island', right: 'Right of island', player: 'Upper row', playerLower: 'Lower row', actions: 'Actions', bottom: 'Below the island', catalog: 'Island controls', widgetCatalog: 'External widgets' },
}
const allElements = [...ISLAND_LAYOUT_ELEMENTS.player, ...ISLAND_LAYOUT_ELEMENTS.reactions, ...ISLAND_LAYOUT_ELEMENTS.actions, ...ISLAND_LAYOUT_ELEMENTS.providers, ...ISLAND_LAYOUT_ELEMENTS.bottom]
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
  const labels = { ...names[locale], localServers: createTranslator(locale)('localServers.title') }
  const zones = zoneNames[locale]
  const layout = useMemo(() => getIslandLayout(config), [config])
  const editorRef = useRef<HTMLElement>(null)
  const pendingFocus = useRef<IslandLayoutElement | null>(null)
  const pointerRef = useRef<LayoutDragCapture & { id: number; x: number; y: number; element: IslandLayoutElement } | null>(null)
  const dragRef = useRef<IslandLayoutElement | null>(null)
  const [dragging, setDragging] = useState<IslandLayoutElement | null>(null)
  const [over, setOver] = useState<Destination | null>(null)
  const [ghost, setGhost] = useState<LayoutDragFrame | null>(null)
  const [announcement, setAnnouncement] = useState('')
  useLayoutEffect(() => {
    if (dragging || !pendingFocus.current) return
    const control = editorRef.current?.querySelector<HTMLElement>(`[data-layout-element="${pendingFocus.current}"]`)
    if (control) { control.focus({ preventScroll: true }); pendingFocus.current = null }
  }, [dragging, layout])

  const placed = Object.values(layout.zones).flat() as IslandLayoutElement[]
  const available = allElements.filter((element) => !placed.includes(element))
  const endDrag = () => { dragRef.current = null; pointerRef.current = null; setDragging(null); setGhost(null); setOver(null) }
  const commit = (next: IslandLayout, base = config) => { onChange(withIslandLayout(base, next)); setAnnouncement(locale === 'ru' ? 'Расположение обновлено' : 'Layout updated') }
  const place = (element: IslandLayoutElement, destination: Destination) => {
    commit(moveIslandElement(layout, element, destination.zone, destination.index))
  }

  const destinationAt = (x: number, y: number): Destination | null => {
    if (!dragRef.current) return null
    let zoneNode = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-layout-target]')
    while (zoneNode && !canPlaceIslandElement(layout, dragRef.current, zoneNode.dataset.layoutTarget as IslandLayoutDropTarget)) {
      zoneNode = zoneNode.parentElement?.closest<HTMLElement>('[data-layout-target]')
    }
    if (!zoneNode || !editorRef.current?.contains(zoneNode)) return null
    const zone = zoneNode.dataset.layoutTarget as IslandLayoutDropTarget
    if (isIslandCatalog(zone)) return { zone }
    const values = (layout.zones[zone] as IslandLayoutElement[]).filter((item) => item !== dragRef.current)
    const nodes = Array.from(zoneNode.querySelectorAll<HTMLElement>('[data-layout-element]'))
      .filter((node) => values.includes(node.dataset.layoutElement as IslandLayoutElement))
    const before = nodes.find((node) => { const rect = node.getBoundingClientRect(); return zone === 'actions' && islandArrangement(layout) !== 'inline' ? y < rect.top + rect.height / 2 : x < rect.left + rect.width / 2 })
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
      if (destination && dragRef.current) {
        pendingFocus.current = dragRef.current
        place(dragRef.current, destination)
      }
      event.currentTarget.releasePointerCapture(event.pointerId); endDrag()
    },
    onPointerCancel: endDrag, onLostPointerCapture: endDrag,
  })
  const keyboardDrag = (event: KeyboardEvent, element: IslandLayoutElement) => {
    if (event.key === 'Escape') { event.preventDefault(); endDrag(); return }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (dragging === element && over) {
        pendingFocus.current = element
        place(element, over)
        endDrag()
      }
      else { dragRef.current = element; setDragging(element); setOver(null); setAnnouncement(locale === 'ru' ? 'Стрелки — выбрать место, Enter — перенести, Escape — отменить.' : 'Arrows choose a place, Enter drops, Escape cancels.') }
    }
    if (dragging === element && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault()
      const targets = (Object.keys(zones) as IslandLayoutDropTarget[]).filter((target) => canPlaceIslandElement(layout, element, target)).flatMap<Destination>(zone => {
        if (isIslandCatalog(zone)) return [{ zone }]
        const items = (layout.zones[zone] as IslandLayoutElement[]).filter(item => item !== element)
        return [...items.flatMap((item, index) => item === 'transport' && items.includes('artwork') ? [] : [{ zone, index }]), { zone, index: items.length }]
      })
      const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
      const origin = event.currentTarget.closest<HTMLElement>('[data-layout-target]')?.dataset.layoutTarget as IslandLayoutDropTarget
      const source = over?.zone ?? origin
      const index = over?.index ?? (isIslandCatalog(origin) ? 0 : (layout.zones[origin] as IslandLayoutElement[]).indexOf(element))
      let next: Destination
      if (canPlaceIslandElement(layout, element, 'player') && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        const rows: IslandLayoutDropTarget[] = ['player', 'playerLower']
        if (canPlaceIslandElement(layout, element, 'catalog')) rows.push('catalog')
        const zone = rows[(rows.indexOf(source) + step + rows.length) % rows.length]
        next = isIslandCatalog(zone) ? { zone } : { zone, index: Math.min(index, layout.zones[zone].filter(item => item !== element).length) }
      } else {
        const initial = isIslandCatalog(source) ? -1 : targets.findIndex(item => item.zone === source && item.index === index)
        const current = over ? targets.findIndex(item => item.zone === over.zone && item.index === over.index) : initial
        next = targets[current < 0 ? step > 0 ? 0 : targets.length - 1 : (current + step + targets.length) % targets.length]
      }
      setOver(next); setAnnouncement(`${zones[next.zone]}${next.index == null ? '' : ` · ${next.index + 1}`}`)
    }
  }
  const elementView = (element: IslandLayoutElement, node: ReactNode, catalog = false) => {
    const fixed = element === 'settings' || element === 'transport'
    const targetItems = dragging && over && !isIslandCatalog(over.zone)
      ? (layout.zones[over.zone] as IslandLayoutElement[]).filter(item => item !== dragging) : []
    const insertion = over?.index == null ? undefined : targetItems[over.index] === element ? 'before'
      : over.index === targetItems.length && targetItems.at(-1) === element ? 'after' : undefined
    return <div key={element} className={`island-editor-element${catalog ? ' island-editor-element--catalog' : ''}`} data-layout-element={element} data-protected={fixed || undefined} data-insert={insertion} data-picked={dragging === element || undefined} draggable={false} {...pointerHandlers(element)} tabIndex={0} role="button" aria-label={labels[element]} aria-pressed={dragging === element} title={!fixed && catalog && ['like', 'dislike', 'shuffle', 'repeat'].includes(element) ? `${labels[element]} · ${['like', 'dislike'].includes(element) ? 'Direct Yandex' : locale === 'ru' ? 'зависит от плеера' : 'depends on player'}` : fixed ? `${labels[element]} · ${locale === 'ru' ? 'всегда на островке' : 'always on island'}` : labels[element]} onKeyDown={(event) => keyboardDrag(event, element)}>
      <div className="island-editor-element__visual" inert aria-hidden="true">{node}</div>
    </div>
  }
  const zoneView = (zone: IslandLayoutZone, node: ReactNode) => <div className={`island-editor-zone island-editor-zone--${zone}`} role="group" aria-label={zones[zone]} data-layout-target={zone} data-ready={Boolean(dragging && canPlaceIslandElement(layout, dragging, zone)) || undefined} data-over={over?.zone === zone || undefined}>{node}</div>
  const reset = () => {
    const defaults = getLegacyIslandLayout({ ...config, layout: { ...config.layout, showPreviousNext: true, showArtwork: true, showProgress: true } })
    commit(defaults, withUiPrefs(config, { localServersWidgetScale: 100 }))
  }
  const catalog = (zone: 'catalog' | 'widgetCatalog') => {
    const elements = available.filter((element) => isIslandWidget(element) === (zone === 'widgetCatalog'))
    if (!elements.length && !(dragging && canPlaceIslandElement(layout, dragging, zone))) return null
    return <div className="island-layout-catalog" role="group" aria-label={zones[zone]} data-layout-target={zone}
      data-ready={Boolean(dragging && canPlaceIslandElement(layout, dragging, zone)) || undefined} data-over={over?.zone === zone || undefined}>
      <div className="island-layout-catalog__items island-root" data-interface-theme={getInterfaceTheme(config)}
        data-interface-palette={getInterfacePalette(config)} data-reduced-transparency={getReducedTransparency(config) || undefined}>
        {elements.map((element) => elementView(element, <IslandElementSample element={element} usage={usage} locale={locale} />, true))}
      </div>
    </div>
  }
  return <section ref={editorRef} style={{ '--drag-indicator': config.appearance.accentColor } as import('react').CSSProperties} className="island-layout-editor" data-dragging={Boolean(dragging) || undefined}>
    <header className="island-layout-editor__header"><div>{showHeading ? <h3>{locale === 'ru' ? 'Ваш островок' : 'Your island'}</h3> : null}<p>{locale === 'ru' ? 'Перетаскивайте элементы между рядами. Край меняет ширину, угол — масштаб.' : 'Drag controls between rows. Pull an edge to change width or a corner to scale.'}</p></div><button type="button" className="island-layout-editor__reset" aria-label={locale === 'ru' ? 'Сбросить настройки островка' : 'Reset island settings'} title={locale === 'ru' ? 'Сбросить расположение, размер, цвет и задержку' : 'Reset layout, size, color and opening delay'} onClick={onReset ?? reset}><RotateCcw size={15} /></button></header>
    <IslandPreview active={active} config={config} label={locale === 'ru' ? 'Редактируемый островок' : 'Editable island'} usage={usage} renderElement={elementView} renderZone={zoneView} onResize={(dimensions) => onChange({ ...config, layout: { ...config.layout, ...dimensions, size: 'medium' } })} onLocalServersResize={(localServersWidgetScale) => onChange(withUiPrefs(config, { localServersWidgetScale }))} />
    <div className="island-layout-editor__catalogs">
      {catalog('catalog')}
      {catalog('widgetCatalog')}
    </div>
    <span className="island-layout-editor__announcement" aria-live="polite">{announcement}</span>
    {ghost && dragging ? <LayoutDragGhost ghost={ghost} /> : null}
  </section>
}
