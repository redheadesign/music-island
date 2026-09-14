import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useReducedMotion } from 'framer-motion'
import { formatTime } from '../../shared/lib/format'
import { MarqueeText } from '../../shared/ui/MarqueeText'
import {
  completeProgressTransition, initialProgressTransition, reconcileProgressTransition,
  type ProgressFrame, type ProgressNavigation,
} from './progressTransition'
import { PROGRESS_ENTER_DURATION_MS, PROGRESS_EXIT_DURATION_MS, watchProgressExit } from './progressExit'
import './ProgressStrip.css'

/** A non-interactive visual layer inside the stable seek button. */
export function ProgressStrip({ frame, navigation, reducedMotion = false, scrubbing = false }: {
  frame: ProgressFrame
  navigation: ProgressNavigation | null
  reducedMotion?: boolean
  scrubbing?: boolean
}) {
  const systemReducedMotion = useReducedMotion()
  const skipMotion = reducedMotion || Boolean(systemReducedMotion) || scrubbing
  const [state, setState] = useState(() => initialProgressTransition(frame))
  const fillRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    setState((current) => reconcileProgressTransition(current, frame, navigation, skipMotion))
  }, [frame, navigation, skipMotion])
  useLayoutEffect(() => {
    if (state.phase !== 'exiting' || !fillRef.current) return
    const generation = state.generation
    return watchProgressExit(fillRef.current, () => {
      setState((current) => current.generation === generation ? completeProgressTransition(current) : current)
    })
    // Pending timeline updates do not restart the exit deadline. Completion
    // always reads current state so rapid navigation reveals the latest frame.
  }, [state.phase, state.generation])

  return (
    <span key={state.generation}
      className={`progress-visual ${state.phase === 'exiting' ? 'progress-visual--exiting' : state.generation ? 'progress-visual--entering' : ''}`}
      data-progress-phase={state.phase} data-progress-direction={state.direction}
      data-progress-track={state.visible.trackKey} data-reduced-motion={skipMotion || undefined}
      style={{
        '--progress': state.visible.ratio,
        '--progress-exit-duration': `${PROGRESS_EXIT_DURATION_MS}ms`,
        '--progress-enter-duration': `${PROGRESS_ENTER_DURATION_MS}ms`,
      } as CSSProperties}
    >
      <span ref={fillRef} className="progress-fill" onAnimationEnd={() => {
        if (state.phase === 'exiting') setState(completeProgressTransition)
      }} />
      <span className="progress-content progress-content--track" title={state.visible.label}>
        <MarqueeText text={state.visible.label} />
      </span>
      <span className="progress-content progress-content--time">
        {formatTime(state.visible.positionMs)} / {formatTime(state.visible.durationMs)}
      </span>
    </span>
  )
}
