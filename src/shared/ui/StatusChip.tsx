import type { HTMLAttributes } from 'react'
import { GlassPill } from './GlassPill'

interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'warning' | 'danger'
}

export function StatusChip({
  tone = 'neutral',
  className = '',
  ...props
}: StatusChipProps) {
  return (
    <GlassPill
      className={`status-chip status-chip--${tone} ${className}`.trim()}
      {...props}
    />
  )
}
