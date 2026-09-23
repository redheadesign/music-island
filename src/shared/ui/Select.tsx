import { Check, ChevronDown, DotsThree } from './SettingsIcons'
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import './Select.css'

type Option = { value: string; label: string; danger?: boolean }

const PORTAL_THEME_PROPERTIES = [
  '--border-strong',
  '--focus-ring',
  '--shadow-popover',
  '--status-danger',
  '--control-surface',
  '--control-surface-hover',
  '--fg-primary',
  '--fg-secondary',
  '--surface-glass',
  '--surface-hover',
  '--surface-raised',
] as const

interface SelectProps {
  value: string
  options: Option[]
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel?: string
  placeholder?: string
}

export function Select(props: SelectProps) { return <Menu {...props} /> }

/** Shares placement, portal theme, dismissal and keyboard handling with Select. */
export function ActionMenu({ label, items, disabled }: { label: string; disabled?: boolean; items: { id: string; label: string; onSelect: () => void; danger?: boolean }[] }) {
  return <Menu actions value="" ariaLabel={label} disabled={disabled} options={items.map(item => ({ value: item.id, label: item.label, danger: item.danger }))} onChange={id => items.find(item => item.id === id)?.onSelect()} />
}

function Menu({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  placeholder = '—',
  actions = false,
}: SelectProps & { actions?: boolean }) {
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const focusOnOpen = useRef(0)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxHeight: 280 })
  const [portalTheme, setPortalTheme] = useState<CSSProperties>({})

  const selected = options.find((o) => o.value === value)
  const label = selected?.label || placeholder

  const openMenu = (edge?: 'first' | 'last') => {
    const selectedIndex = options.findIndex((option) => option.value === value)
    focusOnOpen.current = edge === 'first'
      ? 0
      : edge === 'last'
        ? options.length - 1
        : Math.max(0, selectedIndex)
    setOpen(true)
  }

  const closeMenu = (restoreFocus = false) => {
    if (restoreFocus) buttonRef.current?.focus({ preventScroll: true })
    setOpen(false)
  }

  const handleMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
      return
    }
    if (event.key === 'Tab') {
      const trigger = buttonRef.current
      const destination = trigger ? adjacentTabStop(trigger, menuRef.current, event.shiftKey) : undefined
      if (destination) {
        // Unmounting a focused portal can reset the browser's tab starting
        // point. Resolve the form's next stop before closing the menu.
        event.preventDefault()
        closeMenu()
        destination.focus()
      } else {
        // At the document boundary, let the browser move to its own chrome.
        closeMenu(true)
      }
      return
    }
    const currentIndex = Math.max(0, optionRefs.current.findIndex((option) => option === event.target))
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : event.key === 'ArrowDown'
          ? Math.min(options.length - 1, currentIndex + 1)
          : event.key === 'ArrowUp'
            ? Math.max(0, currentIndex - 1)
            : null
    if (nextIndex == null) return
    event.preventDefault()
    optionRefs.current[nextIndex]?.focus({ preventScroll: true })
    optionRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest' })
  }

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const placeMenu = () => {
      if (!buttonRef.current) return
      const r = buttonRef.current.getBoundingClientRect()
      const viewportWidth = document.documentElement.clientWidth
      const viewportHeight = window.innerHeight
      const inset = 12
      const gap = 6
      const width = Math.min(Math.max(r.width, 240), Math.max(1, viewportWidth - inset * 2))
      const left = Math.max(inset, Math.min(r.left, viewportWidth - width - inset))
      const desiredHeight = Math.min(menuRef.current?.scrollHeight || 52, 280)
      const below = Math.max(0, viewportHeight - r.bottom - gap - inset)
      const above = Math.max(0, r.top - gap - inset)
      const openBelow = below >= desiredHeight || below >= above
      const maxHeight = Math.max(1, Math.min(280, openBelow ? below : above, viewportHeight - inset * 2))
      const height = Math.min(desiredHeight, maxHeight)
      const anchorTop = openBelow ? r.bottom + gap : r.top - gap - height
      const top = Math.max(inset, Math.min(anchorTop, viewportHeight - height - inset))
      setPos((previous) => previous.top === top && previous.left === left && previous.width === width && previous.maxHeight === maxHeight
        ? previous
        : { top, left, width, maxHeight })
    }
    placeMenu()
    const observer = new ResizeObserver(placeMenu)
    observer.observe(buttonRef.current)
    if (menuRef.current) observer.observe(menuRef.current)
    window.addEventListener('resize', placeMenu)
    window.addEventListener('scroll', placeMenu, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', placeMenu)
      window.removeEventListener('scroll', placeMenu, true)
    }
  }, [open, options.length])

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const trigger = buttonRef.current
    const syncPortalTheme = () => setPortalTheme(readPortalTheme(trigger))
    syncPortalTheme()

    const settingsRoot = trigger.closest('[data-color-scheme]')
    if (!settingsRoot) return
    const observer = new MutationObserver(syncPortalTheme)
    observer.observe(settingsRoot, { attributes: true, attributeFilter: ['data-color-scheme'] })
    return () => observer.disconnect()
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    optionRefs.current[focusOnOpen.current]?.focus({ preventScroll: true })
    optionRefs.current[focusOnOpen.current]?.scrollIntoView({ block: 'nearest' })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      const t = event.target as Node
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className={['dark-select', actions ? 'dark-select--actions' : '', open ? 'dark-select--open' : ''].filter(Boolean).join(' ')}
        aria-haspopup={actions ? 'menu' : 'listbox'}
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={ariaLabel}
        aria-describedby={ariaLabel && !actions ? `${id}-value` : undefined}
        disabled={disabled}
        onClick={() => open ? closeMenu() : openMenu()}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            openMenu(event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : undefined)
          } else if (event.key === 'Escape' && open) {
            event.preventDefault()
            event.stopPropagation()
            closeMenu(true)
          } else if (event.key === 'Tab' && open) {
            closeMenu()
          }
        }}
      >
        {actions ? <DotsThree size={22} weight="bold" aria-hidden /> : <><span id={`${id}-value`} className="dark-select__label" title={label}>{label}</span><ChevronDown size={14} className="dark-select__chevron" aria-hidden /></>}
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={`${id}-menu`}
              className="dark-select-menu"
              role={actions ? 'menu' : 'listbox'}
              aria-labelledby={id}
              style={{ ...portalTheme, ...pos }}
              onKeyDown={handleMenuKey}
            >
              {options.length === 0 ? (
                <div className="dark-select-option dark-select-option--empty" role="option" aria-disabled="true">{placeholder}</div>
              ) : (
                options.map((option, index) => {
                  const active = option.value === value
                  return (
                    <button
                      key={option.value}
                      ref={(element) => { optionRefs.current[index] = element }}
                      type="button"
                      role={actions ? 'menuitem' : 'option'}
                      tabIndex={-1}
                      aria-selected={actions ? undefined : active}
                      data-danger={option.danger || undefined}
                      className={[
                        'dark-select-option',
                        active ? 'dark-select-option--active' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => {
                        closeMenu(true)
                        onChange(option.value)
                      }}
                    >
                      <span>{option.label}</span>
                      {active && !actions ? <Check size={14} className="dark-select-option__check" aria-hidden /> : null}
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

function readPortalTheme(trigger: HTMLElement) {
  const computed = getComputedStyle(trigger)
  const theme = { colorScheme: computed.colorScheme } as CSSProperties & Record<string, string>
  for (const property of PORTAL_THEME_PROPERTIES) {
    theme[property] = computed.getPropertyValue(property)
  }
  return theme
}

function adjacentTabStop(trigger: HTMLElement, menu: HTMLElement | null, backwards: boolean) {
  const selector = 'a[href], area[href], button, input, select, textarea, iframe, summary, [tabindex], [contenteditable="true"], audio[controls], video[controls]'
  const candidates = Array.from(trigger.ownerDocument.querySelectorAll<HTMLElement>(selector))
    .filter((element) => {
      if (element.tabIndex < 0 || menu?.contains(element)) return false
      if (element.matches(':disabled, [aria-disabled="true"]')) return false
      if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false
      if (!element.getClientRects().length) return false
      const visibility = getComputedStyle(element).visibility
      return visibility !== 'hidden' && visibility !== 'collapse'
    })
    // Positive tabindex entries precede the natural document order.
    .sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity))
  const triggerIndex = candidates.indexOf(trigger)
  return triggerIndex < 0 ? undefined : candidates[triggerIndex + (backwards ? -1 : 1)]
}
