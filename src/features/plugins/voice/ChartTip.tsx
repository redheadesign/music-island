import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

export function ChartTipAnchor({
  tip,
  children,
  className,
  style,
}: {
  tip: string
  children?: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({
      top: r.top - 8,
      left: r.left + r.width / 2,
    })
  }, [open])

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={className}
        style={style}
        aria-label={tip}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </button>
      {open
        ? createPortal(
            <div className="chart-tip" style={{ top: pos.top, left: pos.left }} role="tooltip">
              {tip}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
