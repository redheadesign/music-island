import type { HTMLAttributes } from 'react'
import { GlassPill } from './GlassPill'
import './StatusChip.css'

interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
  appearance?: 'glass' | 'flat'
}

export function StatusChip({
  tone = 'neutral',
  appearance = 'glass',
  className = '',
  ...props
}: StatusChipProps) {
  return (
    <GlassPill
      className={`status-chip status-chip--${tone} status-chip--${appearance} ${className}`.trim()}
      {...props}
    />
  )
}
