import type { ReactNode } from 'react'
import { ChevronDown } from '../../shared/ui/SettingsIcons'
import './DictationSections.css'

export function DictationDisclosure({ title, summary, children, initiallyOpen = false, onOpenChange }: {
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
    <details className="dictation-disclosure" ref={openOnMount} onToggle={event => onOpenChange?.(event.currentTarget.open)}>
      <summary>
        <span className="dictation-disclosure__title">{title}</span>
        {summary ? <span className="dictation-disclosure__value">{summary}</span> : null}
        <ChevronDown className="dictation-disclosure__chevron" size={16} aria-hidden="true" />
      </summary>
      <div className="dictation-disclosure__body">{children}</div>
    </details>
  )
}
