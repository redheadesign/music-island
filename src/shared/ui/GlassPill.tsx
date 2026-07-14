import type { HTMLAttributes } from 'react'

export function GlassPill({
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`glass-pill ${className}`.trim()} {...props} />
}
