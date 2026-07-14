import type { HTMLAttributes } from 'react'

interface GlassSurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article'
}

export function GlassSurface({
  as: Component = 'div',
  className = '',
  ...props
}: GlassSurfaceProps) {
  return <Component className={`glass-surface ${className}`.trim()} {...props} />
}
