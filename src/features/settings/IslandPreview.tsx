import { IslandFeedback } from '../../shared/ui/PressFeedback'
import { SettingsFilled, SquareTerminal } from '../../shared/ui/SettingsIcons'
import { Mic, Pin } from 'lucide-react'
import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import type { AppConfig } from '../../shared/lib/types'
import type { LocalServer } from '../../shared/lib/localServerTypes'
import type { UsageSnapshot } from '../../shared/lib/usageTypes'
import { getIslandLayout, type IslandLayoutElement, type IslandLayoutZone } from '../../shared/lib/islandLayout'
import { getLocalServersWidgetScale, getUsageWidgetCompact, getUsageWidgetScale, LOCAL_SERVERS_WIDGET_SCALE_RANGE } from '../../shared/lib/uiPrefs'
import { createTranslator } from '../../shared/i18n/messages'
import { MusicModule } from '../music/MusicModule'
import { LocalServersPanel } from '../overlay/LocalServersPanel'
import { IslandMusicElementSample } from './IslandMusicElementSample'
import { UsageStatusChip } from '../usage/UsageStatusChip'
import { WarpSurface } from '../../shared/ui/WarpSurface'
import { projectPreviewScale } from '../../shared/lib/previewSizing'
import { PreviewResizeHandle } from '../../shared/ui/PreviewResizeHandle'
import { APPEARANCE_PREVIEW_MEDIA as media } from './previewMedia'
import './IslandPreview.css'

type ResizeValues = Pick<AppConfig['layout'], 'width' | 'scale'> & { localServersScale: number }
type ResizeDimension = keyof ResizeValues

const resizeLimits = {
  width: { min: 80, max: 125 },
  scale: { min: 70, max: 120 },
  localServersScale: LOCAL_SERVERS_WIDGET_SCALE_RANGE,
} as const

const localServersSample: readonly LocalServer[] = [
  { id: 'preview-vite', pid: 1, processName: 'node.exe', host: '127.0.0.1', port: 5173, canStop: true },
  { id: 'preview-python', pid: 2, processName: 'python.exe', host: '[::1]', port: 8000, canStop: true },
]

export type IslandPreviewRenderers = {
  renderElement?: (element: IslandLayoutElement, node: ReactNode) => ReactNode
  renderZone?: (zone: IslandLayoutZone, node: ReactNode) => ReactNode
}

/** Production island dimensions, materials and controls. Only the whole scene scales to fit. */
export function IslandPreview({ config, label, usage, onResize, onLocalServersResize, active = true, renderElement = (_id, node) => node, renderZone = (_id, node) => node }: {
  config: AppConfig; label: string; usage?: UsageSnapshot | { snapshot: UsageSnapshot | null } | null
  active?: boolean
  onResize?: (dimensions: Pick<AppConfig['layout'], 'width' | 'scale'>) => void
  onLocalServersResize?: (scale: number) => void
} & IslandPreviewRenderers) {
  const layout = getIslandLayout(config)
  const host = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const localServersBody = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const [frameHeight, setFrameHeight] = useState(170)
  const leftContent = useRef<HTMLDivElement>(null)
  const rightContent = useRef<HTMLDivElement>(null)
  const [measuredSides, setMeasuredSides] = useState({ left: 0, right: 0 })
  const gesture = useRef<{ id: number; x: number; y: number; dimension: ResizeDimension; direction: number; width: number; height: number; initial: ResizeValues; next: ResizeValues } | null>(null)
  const [dimensions, setDimensions] = useState<ResizeValues | null>(null)
  const committedDimensions: ResizeValues = { width: config.layout.width, scale: config.layout.scale, localServersScale: getLocalServersWidgetScale(config) }
  const sizing = dimensions ?? committedDimensions
  const ru = config.appearance.locale !== 'en'
  const t = createTranslator(ru ? 'ru' : 'en')
  const numberFormat = new Intl.NumberFormat(ru ? 'ru' : 'en', { style: 'percent' })
  const [available, setAvailable] = useState(640)
  useLayoutEffect(() => {
    const node = host.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    const node = frame.current
    if (!node) return
    const measure = () => setFrameHeight(node.offsetHeight)
    const observer = new ResizeObserver(measure)
    observer.observe(node); measure()
    return () => observer.disconnect()
  }, [])
  const snapshot = usage && 'snapshot' in usage ? usage.snapshot : usage
  const compact = getUsageWidgetCompact(config)
  const usageScale = getUsageWidgetScale(config)
  const sideWidth = (side: 'left' | 'right') => Math.max(56, measuredSides[side] + 12)
  const width = 500 * sizing.width / 100
  const sceneWidth = sideWidth('left') + width + sideWidth('right')
  // A stable camera leaves room for the entire allowed resize range. Fitting on
  // every pointer move would cancel the user's scale change or move the handles.
  const cameraScale = Math.min(1, Math.max(.15, (available - 24) / (sideWidth('left') + 625 + sideWidth('right')) / 1.2))
  const scale = cameraScale * sizing.scale / 100
  useLayoutEffect(() => {
    const measure = () => setMeasuredSides((current) => {
      const next = { left: leftContent.current?.offsetWidth ?? 0, right: rightContent.current?.offsetWidth ?? 0 }
      return current.left === next.left && current.right === next.right ? current : next
    })
    const observer = new ResizeObserver(measure)
    if (leftContent.current) observer.observe(leftContent.current)
    if (rightContent.current) observer.observe(rightContent.current)
    measure()
    return () => observer.disconnect()
  }, [])
  const cancelResize = () => { gesture.current = null; setDimensions(null) }
  const resizeHandles = (dimension: ResizeDimension, direction = 1) => {
    const widget = dimension === 'localServersScale'
    const { min, max } = resizeLimits[dimension]
    const clamp = (value: number) => Math.round(Math.max(min, Math.min(max, value)))
    const commit = ({ width, scale, localServersScale }: ResizeValues) => {
      if (widget) onLocalServersResize?.(localServersScale)
      else onResize?.({ width, scale })
    }
    const gripLabel = widget ? t('localServers.scale') : dimension === 'width' ? ru ? 'Ширина островка' : 'Island width' : ru ? 'Масштаб островка' : 'Island scale'
    const readoutLabel = widget ? t('localServers.scale') : t(dimension === 'width' ? 'settings.width' : 'settings.scale')
    const valueText = numberFormat.format(sizing[dimension] / 100)
    return {
      onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
        const target = widget ? localServersBody.current : body.current
        if (event.button !== 0 || !target) return
        event.preventDefault(); event.stopPropagation(); event.currentTarget.focus({ preventScroll: true })
        const rect = target.getBoundingClientRect()
        const initial = committedDimensions
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dimension, direction, width: rect.width, height: rect.height, initial, next: initial }
        setDimensions(initial); event.currentTarget.setPointerCapture(event.pointerId)
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const current = gesture.current
        if (!current || current.id !== event.pointerId) return
        const dx = event.clientX - current.x, dy = event.clientY - current.y
        const value = dimension === 'width'
          ? current.initial.width * (1 + dx * 2 * current.direction / current.width)
          : projectPreviewScale(current.initial[dimension], dx, dy, current.width, current.height)
        current.next = { ...current.initial, [dimension]: clamp(value) }
        setDimensions(current.next)
      },
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
        if (gesture.current?.id !== event.pointerId) return
        const next = gesture.current.next
        cancelResize(); commit(next); event.currentTarget.releasePointerCapture(event.pointerId)
      },
      onPointerCancel: cancelResize, onLostPointerCapture: cancelResize,
      onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') { event.preventDefault(); cancelResize(); return }
        const step = event.shiftKey ? 5 : 1
        const delta = ['ArrowRight', 'ArrowUp'].includes(event.key) ? step : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -step : 0
        if (!delta && !['Home', 'End'].includes(event.key)) return
        event.preventDefault()
        commit({ ...sizing, [dimension]: clamp(event.key === 'Home' ? min : event.key === 'End' ? max : sizing[dimension] + delta) })
      },
      onDoubleClick: () => commit({ ...sizing, [dimension]: 100 }),
      role: 'slider', tabIndex: 0, 'aria-label': gripLabel,
      'aria-valuemin': min, 'aria-valuemax': max,
      'aria-valuenow': sizing[dimension], 'aria-valuetext': valueText,
      'data-readout': `${readoutLabel} ${valueText}`,
      'data-resize-active': (dimensions !== null && gesture.current?.dimension === dimension && gesture.current.direction === direction) || undefined,
    }
  }
  const style = {
    '--drag-indicator': config.appearance.accentColor,
    '--preview-render-scale': scale,
    '--drop-zone-ready': 'color-mix(in srgb, var(--drag-indicator) 12%, transparent)',
    '--drop-zone-active': 'color-mix(in srgb, var(--drag-indicator) 24%, transparent)',
    '--island-width': sizing.width / 100,
    '--island-scale': 1,
    '--actions-scale': 1,
    '--artwork-primary': '168, 98, 55',
    '--artwork-secondary': '87, 63, 49',
    '--preview-left': `${sideWidth('left')}px`, '--preview-right': `${sideWidth('right')}px`,
    width: sceneWidth, transform: `scale(${scale})`, transformOrigin: 'top left',
  } as CSSProperties
  const satellite = (side: 'left' | 'right') => renderZone(side, layout.zones[side].map((provider) => <Fragment key={provider}>{renderElement(provider, <div style={{ zoom: usageScale }}><UsageStatusChip snapshot={snapshot ?? null} enabledProviders={[provider]} compact={compact} locale={config.appearance.locale} /></div>)}</Fragment>))
  return <div className="island-preview-section"><div ref={host} className="island-preview" role="group" aria-label={label} data-resizable={Boolean(onResize) || undefined} data-resizing={dimensions ? gesture.current?.dimension : undefined} data-reduced-motion={config.appearance.reducedMotion || undefined}>
    {active ? <WarpSurface className="preview-warp-material" reducedMotion={config.appearance.reducedMotion} /> : null}
    <div className="island-preview__camera" style={{ width: sceneWidth * scale, height: frameHeight * scale }}>
    <div ref={frame} className={`island-preview__frame island-root theme-${config.appearance.theme}`} style={style}>
      <aside className="island-preview__satellite island-preview__satellite--left"><div className="island-preview__satellite-content" ref={leftContent}>{satellite('left')}</div></aside>
      <div ref={body} className="island-preview__body">
        <IslandFeedback className="island-card island-surface">
          <MusicModule media={media} layout={layout} progressMs={media.positionMs} progressPercent={34} density={config.layout.density} showArtwork={config.layout.showArtwork} showTitle={config.layout.showTitle} showArtist={config.layout.showArtist} showProgress={config.layout.showProgress} showSource={config.layout.showSource} showPreviousNext={config.layout.showPreviousNext} locale={config.appearance.locale} reducedMotion onCommand={() => undefined} renderElement={renderElement} renderZone={renderZone} />
        </IslandFeedback>
        <header className="island-actions">{renderZone('actions', layout.zones.actions.map((element) => <Fragment key={element}>{renderElement(element, <button type="button" className="icon-button" aria-label={element === 'settings' ? 'Open settings' : 'Pin island'}>{element === 'settings' ? <SettingsFilled weight="fill" size={16} /> : element === 'microphone' ? <Mic size={16} /> : <Pin size={16} />}</button>)}</Fragment>))}</header>
        {onResize ? <>
          <div className="island-preview__resize-edge island-preview__resize-edge--left preview-resize-readout" {...resizeHandles('width', -1)} />
          <div className="island-preview__resize-edge island-preview__resize-edge--right preview-resize-readout" {...resizeHandles('width')} />
          <PreviewResizeHandle {...resizeHandles('scale')} />
        </> : null}
      </div>
      <aside className="island-preview__satellite island-preview__satellite--right"><div className="island-preview__satellite-content" ref={rightContent}>{satellite('right')}</div></aside>
      {renderZone('bottom', layout.zones.bottom.includes('localServers') ? <div ref={localServersBody} className="island-preview__bottom-widget">
        {renderElement('localServers', <LocalServersPanel servers={localServersSample} locale={ru ? 'ru' : 'en'} contentScale={sizing.localServersScale / sizing.scale} preview />)}
        {onLocalServersResize ? <PreviewResizeHandle {...resizeHandles('localServersScale')} /> : null}
      </div> : null)}
    </div>
    </div>
    </div>
  </div>
}

export function IslandElementSample({ element, usage, locale = 'ru' }: { element: IslandLayoutElement; usage?: UsageSnapshot | null; locale?: 'ru' | 'en' }) {
  if (element === 'codex' || element === 'claude') return <UsageStatusChip snapshot={usage ?? null} enabledProviders={[element]} compact locale={locale} />
  if (element === 'localServers') return <div className="island-preview__widget island-surface"><SquareTerminal size={20} aria-hidden="true" />{createTranslator(locale)('localServers.title')}</div>
  return <IslandMusicElementSample element={element} locale={locale} />
}
