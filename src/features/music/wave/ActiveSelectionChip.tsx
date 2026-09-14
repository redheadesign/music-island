import { useId } from 'react'
import type { WaveSelection } from '../../../shared/lib/types'
import './wave.css'

interface ActiveSelectionChipProps {
  selection: WaveSelection
  disabled?: boolean
  onClear: () => void
}

export function ActiveSelectionChip({
  selection,
  disabled = false,
  onClear,
}: ActiveSelectionChipProps) {
  const cutoutId = useId()
  return (
    <div className="wave-selection-chip island-surface" aria-label={`Активная подборка: ${selection.label}`}>
      <span>{selection.label}</span>
      {selection.removable ? (
        <button
          type="button"
          aria-label={`Выключить подборку ${selection.label}`}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation()
            onClear()
          }}
        >
          <svg viewBox="0 0 22 22" aria-hidden="true" focusable="false">
            <defs>
              <mask id={cutoutId} maskUnits="userSpaceOnUse" x="0" y="0" width="22" height="22">
                <rect width="22" height="22" fill="white" />
                <path d="m8 8 6 6m0-6-6 6" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" />
              </mask>
            </defs>
            <circle cx="11" cy="11" r="11" fill="currentColor" mask={`url(#${cutoutId})`} />
          </svg>
        </button>
      ) : null}
    </div>
  )
}
