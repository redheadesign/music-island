import type { CSSProperties } from 'react'

interface HoverCoachProps {
  label: string
}

/** One-shot post-intro hint: peek cue + floating cursor toward the top edge. */
export function HoverCoach({ label }: HoverCoachProps) {
  return (
    <div className="hover-coach" aria-live="polite" role="status">
      <div className="hover-coach__band" aria-hidden="true" />
      <div className="hover-coach__cursor" aria-hidden="true" style={{ '--coach-bob': '1' } as CSSProperties}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path
            d="M5.5 3.5 L5.5 16.5 L9.2 13.2 L11.4 19.1 L13.6 18.2 L11.4 12.3 L16.5 12.3 Z"
            fill="currentColor"
            stroke="rgba(0,0,0,0.35)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="hover-coach__label">{label}</p>
    </div>
  )
}
