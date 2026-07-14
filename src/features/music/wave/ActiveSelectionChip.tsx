import { X } from 'lucide-react'
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
  return (
    <div className="wave-selection-chip" aria-label={`Активная подборка: ${selection.label}`}>
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
          <X aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
