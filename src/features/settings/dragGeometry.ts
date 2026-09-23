export interface DragBounds { left: number; top: number; width: number; height: number }

/** Every value is in viewport CSS pixels, including zoomed previews and DPI. */
export function captureDragGeometry(bounds: DragBounds, x: number, y: number) {
  return { offsetX: x - bounds.left, offsetY: y - bounds.top, width: bounds.width, height: bounds.height }
}

export function dragPosition(grab: ReturnType<typeof captureDragGeometry>, x: number, y: number) {
  return { left: x - grab.offsetX, top: y - grab.offsetY }
}

export function captureLayoutDrag(node: HTMLElement, x: number, y: number) {
  const clone = node.cloneNode(true) as HTMLElement
  const originals = [node, ...node.querySelectorAll<HTMLElement | SVGElement>('*')]
  const copies = [clone, ...clone.querySelectorAll<HTMLElement | SVGElement>('*')]
  originals.forEach((original, index) => {
    const computed = getComputedStyle(original)
    for (let i = 0; i < computed.length; i++) {
      const property = computed.item(i)
      copies[index].style.setProperty(property, computed.getPropertyValue(property))
    }
    copies[index].style.setProperty('animation', 'none')
    copies[index].style.setProperty('transition', 'none')
    copies[index].removeAttribute('id')
    copies[index].removeAttribute('tabindex')
  })
  clone.removeAttribute('data-picked')
  return { grab: captureDragGeometry(node.getBoundingClientRect(), x, y), clone,
    sourceWidth: Math.max(1, node.offsetWidth), sourceHeight: Math.max(1, node.offsetHeight) }
}

export type LayoutDragCapture = ReturnType<typeof captureLayoutDrag>
export type LayoutDragFrame = Omit<LayoutDragCapture, 'grab'> & { left: number; top: number; width: number; height: number }

