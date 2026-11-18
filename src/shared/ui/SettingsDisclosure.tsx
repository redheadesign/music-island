import type { ReactNode } from 'react'
import { ChevronDown } from './SettingsIcons'
import './SettingsDisclosure.css'

export function SettingsDisclosure({ title, summary, children, initiallyOpen = false, onOpenChange }: {
  title: string
  summary?: ReactNode
  children: ReactNode
  initiallyOpen?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  // The native disclosure supplies keyboard handling and removes closed controls from the tab order.
  const openOnMount = (node: HTMLDetailsElement | null) => {
    if (node && initiallyOpen && !node.dataset.initialized) node.open = true
    if (node) node.dataset.initialized = 'true'
  }
  return (
    <details className="settings-disclosure" ref={openOnMount} onToggle={event => onOpenChange?.(event.currentTarget.open)}>
      <summary>
        <span className="settings-disclosure__title">{title}</span>
        {summary ? <span className="settings-disclosure__value">{summary}</span> : null}
        <ChevronDown className="settings-disclosure__chevron" size={16} aria-hidden="true" />
      </summary>
      <div className="settings-disclosure__body">{children}</div>
    </details>
  )
}
