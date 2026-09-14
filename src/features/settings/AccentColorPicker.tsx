import { Pipette } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { ACCENT_PRESETS, normalizeHexColor } from '../../shared/lib/accentTheme'
import './AccentColorPicker.css'

interface AccentColorPickerProps {
  value: string
  onChange: (hex: string) => void
  label: string
  customLabel: string
}

type Hsv = { h: number; s: number; v: number }

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function hexToHsv(hex: string): Hsv {
  const normalized = normalizeHexColor(hex).slice(1)
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const toByte = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`
}

function hueColor(h: number) {
  return hsvToHex({ h, s: 1, v: 1 })
}

export function AccentColorPicker({
  value,
  onChange,
  label,
  customLabel,
}: AccentColorPickerProps) {
  const current = normalizeHexColor(value)
  const isPreset = ACCENT_PRESETS.some((hex) => normalizeHexColor(hex) === current)
  const [open, setOpen] = useState(false)
  const [hsv, setHsv] = useState(() => hexToHsv(current))
  const [hexDraft, setHexDraft] = useState(current.toUpperCase())
  const hsvRef = useRef(hsv)
  const rootRef = useRef<HTMLDivElement>(null)
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const commit = useCallback(
    (next: Hsv) => {
      hsvRef.current = next
      setHsv(next)
      const hex = hsvToHex(next)
      setHexDraft(hex.toUpperCase())
      onChange(hex)
    },
    [onChange],
  )

  useEffect(() => {
    if (open) return
    const next = hexToHsv(current)
    hsvRef.current = next
    setHsv(next)
    setHexDraft(current.toUpperCase())
  }, [current, open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const bindPad = (
    ref: RefObject<HTMLDivElement | null>,
    read: (rect: DOMRect, x: number, y: number) => Hsv,
  ) => {
    const handle = (event: ReactPointerEvent<HTMLDivElement>) => {
      const el = ref.current
      if (!el) return
      el.setPointerCapture(event.pointerId)
      const update = (clientX: number, clientY: number) => {
        const rect = el.getBoundingClientRect()
        commit(read(rect, clientX, clientY))
      }
      update(event.clientX, event.clientY)
      const onMove = (moveEvent: PointerEvent) => update(moveEvent.clientX, moveEvent.clientY)
      const onUp = () => {
        el.releasePointerCapture(event.pointerId)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
    return handle
  }

  const preview = hsvToHex(hsv)

  return (
    <div className="accent-picker" ref={rootRef}>
      <div className="accent-picker__copy">
        <strong>{label}</strong>
      </div>
      <div className="accent-picker__row" role="group" aria-label={label}>
        {ACCENT_PRESETS.map((hex) => {
          const active = normalizeHexColor(hex) === current
          return (
            <button
              key={hex}
              type="button"
              aria-pressed={active}
              aria-label={`${label} ${hex}`}
              className={['accent-picker__swatch', active ? 'accent-picker__swatch--active' : ''].join(' ')}
              style={{ background: hex }}
              title={hex}
              onClick={() => {
                setOpen(false)
                onChange(normalizeHexColor(hex))
              }}
            />
          )
        })}
        <button
          type="button"
          aria-pressed={!isPreset}
          aria-label={customLabel}
          aria-expanded={open}
          aria-controls={panelId}
          className={[
            'accent-picker__swatch',
            'accent-picker__custom',
            !isPreset || open ? 'accent-picker__swatch--active' : '',
          ].join(' ')}
          title={customLabel}
          onClick={() => {
            setHsv(hexToHsv(current))
            setHexDraft(current.toUpperCase())
            setOpen((v) => !v)
          }}
        >
          <Pipette aria-hidden="true" size={14} strokeWidth={2.2} />
        </button>
      </div>

      {open && (
        <div className="accent-picker__panel" id={panelId} role="dialog" aria-label={customLabel}>
          <div
            ref={svRef}
            className="accent-picker__sv"
            style={{ backgroundColor: hueColor(hsv.h) }}
            onPointerDown={bindPad(svRef, (rect, x, y) => ({
              h: hsvRef.current.h,
              s: clamp((x - rect.left) / rect.width, 0, 1),
              v: 1 - clamp((y - rect.top) / rect.height, 0, 1),
            }))}
          >
            <span
              className="accent-picker__sv-thumb"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: preview }}
            />
          </div>

          <div
            ref={hueRef}
            className="accent-picker__hue"
            onPointerDown={bindPad(hueRef, (rect, x) => ({
              h: clamp(((x - rect.left) / rect.width) * 360, 0, 359.999),
              s: hsvRef.current.s,
              v: hsvRef.current.v,
            }))}
          >
            <span className="accent-picker__hue-thumb" style={{ left: `${(hsv.h / 360) * 100}%` }} />
          </div>

          <div className="accent-picker__meta">
            <span className="accent-picker__preview" style={{ background: preview }} />
            <label className="accent-picker__hex">
              <span>HEX</span>
              <input
                value={hexDraft}
                spellCheck={false}
                maxLength={7}
                onChange={(event) => {
                  const next = event.currentTarget.value
                  setHexDraft(next)
                  if (/^#?[0-9a-fA-F]{6}$/.test(next) || /^#?[0-9a-fA-F]{3}$/.test(next)) {
                    const hex = normalizeHexColor(next.startsWith('#') ? next : `#${next}`)
                    hsvRef.current = hexToHsv(hex)
                    setHsv(hsvRef.current)
                    onChange(hex)
                  }
                }}
                onBlur={() => {
                  const hex = normalizeHexColor(hexDraft.startsWith('#') ? hexDraft : `#${hexDraft}`, preview)
                  setHexDraft(hex.toUpperCase())
                  hsvRef.current = hexToHsv(hex)
                  setHsv(hsvRef.current)
                  onChange(hex)
                }}
              />
            </label>
            <button type="button" className="accent-picker__done" onClick={() => setOpen(false)}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
