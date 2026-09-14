import { Pin, Settings2 } from 'lucide-react'
import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import type { AppConfig } from '../../shared/lib/types'
import type { UsageSnapshot } from '../../shared/lib/usageTypes'
import { getIslandLayout, type IslandLayoutElement, type IslandLayoutZone } from '../../shared/lib/islandLayout'
import { getUsageWidgetCompact, getUsageWidgetScale } from '../../shared/lib/uiPrefs'
import { MusicModule } from '../music/MusicModule'
import { MediaArtwork, NavigationButton, PlaybackButton, ReactionButton, PlaybackModeButton } from '../music/MusicControls'
import { ProgressStrip } from '../music/ProgressStrip'
import { UsageStatusChip } from '../usage/UsageStatusChip'
import { WarpMaterial } from '../../shared/ui/WarpMaterial'
import { APPEARANCE_PREVIEW_MEDIA as media } from './previewMedia'
import './IslandPreview.css'

export type IslandPreviewRenderers = {
  renderElement?: (element: IslandLayoutElement, node: ReactNode) => ReactNode
  renderZone?: (zone: IslandLayoutZone, node: ReactNode) => ReactNode
}

/** Production island dimensions, materials and controls. Only the whole scene scales to fit. */
export function IslandPreview({ config, label, usage, onResize, active = true, renderElement = (_id, node) => node, renderZone = (_id, node) => node }: {
  config: AppConfig; label: string; usage?: UsageSnapshot | { snapshot: UsageSnapshot | null } | null
  active?: boolean
  onResize?: (dimensions: Pick<AppConfig['layout'], 'width' | 'scale'>) => void
} & IslandPreviewRenderers) {
  const layout = getIslandLayout(config)
  const host = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ id: number; x: number; y: number; dimension: 'width' | 'scale'; direction: number; width: number; height: number; initial: { width: number; scale: number }; next: { width: number; scale: number } } | null>(null)
  const [dimensions, setDimensions] = useState<{ width: number; scale: number } | null>(null)
  const sizing = dimensions ?? config.layout
  const previewConfig = dimensions ? { ...config, layout: { ...config.layout, ...dimensions } } : config
  const ru = config.appearance.locale !== 'en'
  const [available, setAvailable] = useState(640)
  useLayoutEffect(() => {
    const node = host.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const snapshot = usage && 'snapshot' in usage ? usage.snapshot : usage
  const compact = getUsageWidgetCompact(config)
  const usageScale = getUsageWidgetScale(config)
  const sideWidth = (side: 'left' | 'right') => Math.max(56, (compact ? layout.zones[side].length * 84 + Math.max(0, layout.zones[side].length - 1) * 8 : layout.zones[side].length ? 124 : 0) * usageScale + 12)
  const width = 500 * sizing.width / 100
  const sceneWidth = sideWidth('left') + width + sideWidth('right')
  // A stable camera leaves room for the entire allowed resize range. Fitting on
  // every pointer move would cancel the user's scale change or move the handles.
  const cameraScale = Math.min(1, Math.max(.15, (available - 24) / (sideWidth('left') + 625 + sideWidth('right')) / 1.2))
  const scale = cameraScale * sizing.scale / 100
  const clamp = (value: number, dimension: 'width' | 'scale') => Math.round(Math.max(dimension === 'width' ? 80 : 70, Math.min(dimension === 'width' ? 125 : 120, value)))
  const cancelResize = () => { gesture.current = null; setDimensions(null) }
  const resizeHandles = (dimension: 'width' | 'scale', direction = 1) => ({
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !onResize || !body.current) return
      event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true })
      const rect = body.current.getBoundingClientRect()
      const initial = { width: config.layout.width, scale: config.layout.scale }
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dimension, direction, width: rect.width, height: rect.height, initial, next: initial }
      setDimensions(initial); event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const current = gesture.current
      if (!current || current.id !== event.pointerId) return
      const dx = event.clientX - current.x, dy = event.clientY - current.y
      const value = dimension === 'width'
        ? current.initial.width * (1 + dx * 2 * current.direction / current.width)
        : current.initial.scale * (1 + 2 * (dx * current.width + dy * current.height) / (current.width ** 2 + current.height ** 2))
      current.next = { ...current.initial, [dimension]: clamp(value, dimension) }
      setDimensions(current.next)
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      if (gesture.current?.id !== event.pointerId) return
      const next = gesture.current.next
      cancelResize(); onResize?.(next); event.currentTarget.releasePointerCapture(event.pointerId)
    },
    onPointerCancel: cancelResize, onLostPointerCapture: cancelResize,
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') { event.preventDefault(); cancelResize(); return }
      const step = event.shiftKey ? 5 : 1
      const delta = ['ArrowRight', 'ArrowUp'].includes(event.key) ? step : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -step : 0
      if (!delta && !['Home', 'End'].includes(event.key)) return
      event.preventDefault()
      onResize?.({ width: sizing.width, scale: sizing.scale, [dimension]: clamp(event.key === 'Home' ? 0 : event.key === 'End' ? 200 : sizing[dimension] + delta, dimension) })
    },
    onDoubleClick: () => onResize?.({ width: sizing.width, scale: sizing.scale, [dimension]: 100 }),
    role: 'slider', tabIndex: 0, 'aria-label': dimension === 'width' ? ru ? 'Ширина островка' : 'Island width' : ru ? 'Масштаб островка' : 'Island scale',
    'aria-valuemin': dimension === 'width' ? 80 : 70, 'aria-valuemax': dimension === 'width' ? 125 : 120,
    'aria-valuenow': sizing[dimension], 'aria-valuetext': `${sizing[dimension]}%`,
  })
  const style = {
    '--island-width': sizing.width / 100,
    '--island-scale': 1,
    '--actions-scale': 1,
    '--artwork-primary': '168, 98, 55',
    '--artwork-secondary': '87, 63, 49',
    '--preview-left': `${sideWidth('left')}px`, '--preview-right': `${sideWidth('right')}px`,
    width: sceneWidth, zoom: scale,
  } as CSSProperties
  const satellite = (side: 'left' | 'right') => renderZone(side, layout.zones[side].map((provider) => <Fragment key={provider}>{renderElement(provider, <div style={{ zoom: usageScale }}><UsageStatusChip snapshot={snapshot ?? null} enabledProviders={[provider]} compact={compact} locale={config.appearance.locale} /></div>)}</Fragment>))
  return <div ref={host} className="island-preview" aria-label={label} data-resizable={Boolean(onResize) || undefined} data-resizing={dimensions ? gesture.current?.dimension : undefined}>
    {active ? <WarpMaterial className="preview-warp-material" reducedMotion={config.appearance.reducedMotion} /> : null}
    <div className={`island-preview__frame island-root theme-${config.appearance.theme}`} style={style}>
      <aside className="island-preview__satellite island-preview__satellite--left">{satellite('left')}</aside>
      <div ref={body} className="island-preview__body">
        <section className="island-card island-surface">
          <MusicModule media={media} layout={layout} progressMs={media.positionMs} progressPercent={34} density={previewConfig.layout.density} showArtwork={previewConfig.layout.showArtwork} showTitle={previewConfig.layout.showTitle} showArtist={previewConfig.layout.showArtist} showProgress={previewConfig.layout.showProgress} showSource={previewConfig.layout.showSource} showPreviousNext={previewConfig.layout.showPreviousNext} locale={config.appearance.locale} reducedMotion onCommand={() => undefined} renderElement={renderElement} renderZone={renderZone} />
        </section>
        <header className="island-actions">{renderZone('actions', layout.zones.actions.map((element) => <Fragment key={element}>{renderElement(element, <button type="button" className="icon-button" aria-label={element === 'settings' ? 'Open settings' : 'Pin island'}>{element === 'settings' ? <Settings2 size={16} /> : <Pin size={16} />}</button>)}</Fragment>))}</header>
        {onResize ? <>
          <div className="island-preview__resize-edge island-preview__resize-edge--left" {...resizeHandles('width', -1)} />
          <div className="island-preview__resize-edge island-preview__resize-edge--right" {...resizeHandles('width')} />
          <div className="island-preview__resize-corner" {...resizeHandles('scale')}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 13h8V5M9 13l4-4" /></svg></div>
        </> : null}
      </div>
      <aside className="island-preview__satellite island-preview__satellite--right">{satellite('right')}</aside>
    </div>
    {onResize ? <div className="island-preview__dimensions" aria-hidden="true"><span data-active={dimensions ? gesture.current?.dimension === 'width' : undefined}>{ru ? 'Ширина' : 'Width'} <output>{sizing.width}%</output></span><span data-active={dimensions ? gesture.current?.dimension === 'scale' : undefined}>{ru ? 'Масштаб' : 'Scale'} <output>{sizing.scale}%</output></span></div> : null}
  </div>
}

export function IslandElementSample({ element, usage, locale = 'ru' }: { element: IslandLayoutElement; usage?: UsageSnapshot | null; locale?: 'ru' | 'en' }) {
  if (element === 'codex' || element === 'claude') return <UsageStatusChip snapshot={usage ?? null} enabledProviders={[element]} compact locale={locale} />
  if (element === 'previous' || element === 'next') return <NavigationButton direction={element} />
  if (element === 'artwork') return <MediaArtwork src={media.thumbnailDataUrl} />
  if (element === 'transport') return <PlaybackButton />
  if (element === 'like' || element === 'dislike') return <ReactionButton kind={element} />
  if (element === 'shuffle' || element === 'repeat') return <PlaybackModeButton kind={element} locale={locale} />
  if (element === 'progress') return <button type="button" className="progress-track" aria-label="Seek track" style={{ '--progress': .34, width: 210 } as CSSProperties}><ProgressStrip frame={{ trackKey: 'catalog', ratio: .34, positionMs: media.positionMs, durationMs: media.durationMs, label: 'Music Island · Evening Light' }} navigation={null} reducedMotion scrubbing={false} /></button>
  return <button type="button" className="icon-button" aria-label={element}><Pin size={16} /></button>
}
