import type { HTMLAttributes } from 'react'
import './PreviewResizeHandle.css'

/** The island's existing corner grip, shared by every widget preview. */
export function PreviewResizeHandle({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`preview-resize-handle ${className}`}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 13h8V5M9 13l4-4" /></svg></div>
}
