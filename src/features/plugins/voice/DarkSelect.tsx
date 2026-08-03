import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Option = { value: string; label: string }

export function DarkSelect({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  placeholder = '—',
}: {
  value: string
  options: Option[]
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel?: string
  placeholder?: string
}) {
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })

  const selected = options.find((o) => o.value === value)
  const label = selected?.label || placeholder

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const r = buttonRef.current.getBoundingClientRect()
    const width = Math.max(r.width, 240)
    const left = Math.min(r.left, window.innerWidth - width - 12)
    let top = r.bottom + 6
    const estimated = Math.min(options.length * 40 + 12, 280)
    if (top + estimated > window.innerHeight - 12) {
      top = Math.max(12, r.top - estimated - 6)
    }
    setPos({ top, left, width })
  }, [open, options.length])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      const t = event.target as Node
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className={['dark-select', open ? 'dark-select--open' : ''].filter(Boolean).join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="dark-select__label" title={label}>{label}</span>
        <ChevronDown size={14} className="dark-select__chevron" aria-hidden />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="dark-select-menu"
              role="listbox"
              aria-labelledby={id}
              style={{ top: pos.top, left: pos.left, width: pos.width }}
            >
              {options.length === 0 ? (
                <div className="dark-select-option dark-select-option--empty">{placeholder}</div>
              ) : (
                options.map((option) => {
                  const active = option.value === value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={[
                        'dark-select-option',
                        active ? 'dark-select-option--active' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => {
                        onChange(option.value)
                        setOpen(false)
                      }}
                    >
                      {option.label}
                    </button>
                  )
                })
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
