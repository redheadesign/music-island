import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { LayoutDragFrame } from './dragGeometry'

/** Both editors use viewport coordinates and the same portal, outside preview transforms. */
export function LayoutDragGhost({ ghost }: { ghost: LayoutDragFrame }) {
  const host = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const clone = ghost.clone
    Object.assign(clone.style, { position: 'absolute', left: '0', top: '0', margin: '0', zoom: '1', width: `${ghost.sourceWidth}px`, height: `${ghost.sourceHeight}px`, transformOrigin: 'top left', transform: `scale(${ghost.width / ghost.sourceWidth},${ghost.height / ghost.sourceHeight})`, outline: 'none', opacity: '1' })
    host.current?.replaceChildren(clone)
    return () => clone.remove()
  }, [ghost.clone, ghost.sourceWidth, ghost.sourceHeight, ghost.width, ghost.height])
  return createPortal(<div ref={host} className="island-layout-drag-ghost island-root" aria-hidden="true" inert style={{ left: ghost.left, top: ghost.top, width: ghost.width, height: ghost.height }} />, document.body)
}
