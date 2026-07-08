import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

interface MarqueeTextProps {
  text: string
  className?: string
}

export function MarqueeText({ text, className = '' }: MarqueeTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const contentRef = useRef<HTMLSpanElement>(null)
  const [overflowPx, setOverflowPx] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content) {
      return
    }

    const measure = () => {
      const distance = content.scrollWidth - container.clientWidth
      setOverflowPx(distance > 6 ? distance : 0)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [text])

  const active = overflowPx > 0

  return (
    <span
      ref={containerRef}
      className={['marquee', active ? 'marquee--active' : '', className].filter(Boolean).join(' ')}
    >
      <span
        ref={contentRef}
        className="marquee__content"
        style={active ? ({ '--marquee-distance': `${overflowPx}px` } as CSSProperties) : undefined}
      >
        {text}
      </span>
    </span>
  )
}
