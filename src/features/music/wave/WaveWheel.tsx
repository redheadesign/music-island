import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react'
import type { WavePreset } from '../../../shared/lib/types'
import {
  getWheelGeometry,
  snapWheelOffset,
  WHEEL_PITCH_PX,
  WHEEL_VISIBLE_RADIUS,
  wrapIndex,
} from './wheelGeometry'
import './wave.css'

interface WaveWheelProps {
  presets: WavePreset[]
  activeId: string | null
  disabled?: boolean
  reducedMotion?: boolean
  onSelect: (preset: WavePreset) => void
  onInteractionStart?: () => void
}

export function WaveWheel({
  presets,
  activeId,
  disabled = false,
  reducedMotion = false,
  onSelect,
  onInteractionStart,
}: WaveWheelProps) {
  const initialIndex = Math.max(0, presets.findIndex((preset) => preset.id === activeId))
  const offsetRef = useRef(initialIndex)
  const centerRef = useRef(initialIndex)
  const frameRef = useRef<number | null>(null)
  const snapTimerRef = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ pointerId: number; startY: number; startOffset: number } | null>(null)
  const [center, setCenter] = useState(initialIndex)
  const [dragging, setDragging] = useState(false)
  const virtualIndexes = useMemo(
    () => Array.from(
      { length: WHEEL_VISIBLE_RADIUS * 2 + 1 },
      (_, slot) => center + slot - WHEEL_VISIBLE_RADIUS,
    ),
    [center],
  )

  const applyGeometry = useCallback(() => {
    frameRef.current = null
    const root = rootRef.current
    if (!root || presets.length === 0) return
    const offset = offsetRef.current
    const nextCenter = Math.round(offset)
    if (nextCenter !== centerRef.current) {
      centerRef.current = nextCenter
      setCenter(nextCenter)
    }
    root.querySelectorAll<HTMLElement>('[data-wheel-index]').forEach((element) => {
      const virtualIndex = Number(element.dataset.wheelIndex)
      const geometry = getWheelGeometry(virtualIndex - offset)
      element.style.transform = `translate3d(${geometry.x}px, calc(-50% + ${geometry.y}px), 0) scale(${geometry.scale})`
      element.style.opacity = String(geometry.opacity)
      element.style.zIndex = String(geometry.zIndex)
      element.toggleAttribute('data-focused', Math.abs(virtualIndex - offset) < 0.45)
    })
  }, [presets.length])

  const scheduleGeometry = useCallback(() => {
    if (frameRef.current == null) {
      frameRef.current = requestAnimationFrame(applyGeometry)
    }
  }, [applyGeometry])

  const snap = useCallback(() => {
    if (snapTimerRef.current != null) {
      window.clearTimeout(snapTimerRef.current)
      snapTimerRef.current = null
    }
    offsetRef.current = snapWheelOffset(offsetRef.current)
    rootRef.current?.toggleAttribute('data-snapping', !reducedMotion)
    scheduleGeometry()
    if (!reducedMotion) {
      window.setTimeout(() => rootRef.current?.removeAttribute('data-snapping'), 190)
    }
  }, [reducedMotion, scheduleGeometry])

  useEffect(() => {
    const activeIndex = presets.findIndex((preset) => preset.id === activeId)
    if (activeIndex >= 0 && !dragRef.current) {
      offsetRef.current = activeIndex
      centerRef.current = activeIndex
      setCenter(activeIndex)
      scheduleGeometry()
    }
  }, [activeId, presets, scheduleGeometry])

  useEffect(() => {
    scheduleGeometry()
    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      if (snapTimerRef.current != null) {
        window.clearTimeout(snapTimerRef.current)
        snapTimerRef.current = null
      }
    }
  }, [scheduleGeometry, virtualIndexes])

  const queueSnap = () => {
    if (snapTimerRef.current != null) window.clearTimeout(snapTimerRef.current)
    snapTimerRef.current = window.setTimeout(snap, 90)
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (disabled || presets.length < 2) return
    event.preventDefault()
    event.stopPropagation()
    onInteractionStart?.()
    offsetRef.current += Math.max(-1.25, Math.min(1.25, event.deltaY / 110))
    scheduleGeometry()
    queueSnap()
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || presets.length < 2) return
    event.preventDefault()
    event.stopPropagation()
    onInteractionStart?.()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startOffset: offsetRef.current,
    }
    setDragging(true)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    offsetRef.current = drag.startOffset - (event.clientY - drag.startY) / WHEEL_PITCH_PX
    scheduleGeometry()
  }

  const finishPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragRef.current = null
    setDragging(false)
    snap()
  }

  const moveBy = (step: number) => {
    if (disabled || presets.length < 2) return
    onInteractionStart?.()
    offsetRef.current = snapWheelOffset(offsetRef.current) + step
    snap()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveBy(-1)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveBy(1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const preset = presets[wrapIndex(snapWheelOffset(offsetRef.current), presets.length)]
      if (preset) onSelect(preset)
    }
  }

  if (presets.length === 0) return null

  return (
    <div
      ref={rootRef}
      className={['wave-wheel', dragging ? 'wave-wheel--dragging' : ''].join(' ')}
      role="listbox"
      aria-label="Подборки Моей волны"
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onKeyDown={handleKeyDown}
    >
      {virtualIndexes.map((virtualIndex) => {
        const preset = presets[wrapIndex(virtualIndex, presets.length)]
        if (!preset) return null
        const isFocused = virtualIndex === center
        return (
          <button
            key={virtualIndex}
            type="button"
            className="wave-wheel__item"
            data-wheel-index={virtualIndex}
            role="option"
            aria-selected={isFocused}
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation()
              if (!disabled && isFocused) onSelect(preset)
            }}
          >
            <span className="wave-wheel__art" aria-hidden="true">
              {preset.iconUrl ? <img src={preset.iconUrl} alt="" /> : <span>{preset.title.slice(0, 1)}</span>}
            </span>
            <span className="wave-wheel__label">{preset.title}</span>
          </button>
        )
      })}
    </div>
  )
}
