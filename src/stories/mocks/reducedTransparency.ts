import { REDUCED_TRANSPARENCY_QUERY } from '../../shared/ui/useSystemReducedTransparency'

/** Simulate the Windows accessibility setting for the duration of one browser story. */
export function previewReducedTransparency() {
  const matchMedia = window.matchMedia
  window.matchMedia = query => matchMedia.call(window,
    query.split(',').some(part => part.trim() === REDUCED_TRANSPARENCY_QUERY) ? 'all' : query)
  return () => { window.matchMedia = matchMedia }
}
