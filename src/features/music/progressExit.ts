/** Shared with the CSS animation through --progress-exit-duration. */
export const PROGRESS_EXIT_DURATION_MS = 360

/** Shared with the CSS animation through --progress-enter-duration. */
export const PROGRESS_ENTER_DURATION_MS = 180

/** CSS completion events may be cancelled or deferred by a hidden WebView/tab. */
export function watchProgressExit(element: EventTarget, complete: () => void): () => void {
  let settled = false
  const finish = () => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    complete()
  }
  const timer = setTimeout(finish, PROGRESS_EXIT_DURATION_MS + 50)
  const cancelled = (event: Event) => {
    if (event.target === element) finish()
  }
  element.addEventListener('animationcancel', cancelled)
  return () => {
    settled = true
    clearTimeout(timer)
    element.removeEventListener('animationcancel', cancelled)
  }
}
