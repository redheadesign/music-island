import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { WarpMaterial, type WarpMaterialProps } from './WarpMaterial'

type Options = Pick<WarpMaterialProps, 'speed' | 'reducedMotion' | 'fieldClassName' | 'variant' | 'frame' | 'maxPixelCount'>
type Slot = { node: HTMLDivElement; active: boolean; options: Options }
const WarpContext = createContext<((slot: Slot) => () => void) | null>(null)

/** Owns one GPU context for the settings window. The portal target never changes. */
export function WarpSurfaceProvider({ children }: { children: ReactNode }) {
  const [host] = useState(() => { const node = document.createElement('div'); node.className = 'warp-shared-host'; return node })
  const parking = useRef<HTMLDivElement>(null)
  const slots = useRef(new Map<HTMLDivElement, Slot>())
  const [current, setCurrent] = useState<Slot | null>(null)
  const register = useCallback((slot: Slot) => {
    const update = () => {
      const selected = [...slots.current.values()].find(entry => entry.active) ?? null
      const destination = selected?.node ?? parking.current
      if (destination && host.parentElement !== destination) destination.append(host)
      setCurrent(selected)
    }
    slots.current.set(slot.node, slot); update()
    return () => { slots.current.delete(slot.node); update() }
  }, [host])
  useLayoutEffect(() => { if (!host.parentElement) parking.current?.append(host); return () => host.remove() }, [host])
  return <WarpContext.Provider value={register}>{children}<div hidden ref={parking} aria-hidden="true" />{createPortal(<WarpMaterial {...current?.options} active={Boolean(current)} />, host)}</WarpContext.Provider>
}

/** A slot inside Settings; standalone everywhere else, including motion exports. */
export function WarpSurface({ active = true, speed, reducedMotion, fieldClassName, variant, frame, maxPixelCount, ...props }: WarpMaterialProps) {
  const register = useContext(WarpContext)
  const node = useRef<HTMLDivElement>(null)
  const options = useMemo(() => ({ speed, reducedMotion, fieldClassName, variant, frame, maxPixelCount }), [speed, reducedMotion, fieldClassName, variant, frame, maxPixelCount])
  useLayoutEffect(() => {
    if (!register || !node.current) return
    return register({ node: node.current, active, options })
  }, [register, active, options])
  if (!register) return <WarpMaterial {...props} {...options} active={active} />
  return <div {...props} ref={node} className={`warp-material ${props.className ?? ''}`} aria-hidden="true" />
}
