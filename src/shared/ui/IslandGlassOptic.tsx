import { Glass } from 'glisse'
import { memo, useCallback, useState, useSyncExternalStore } from 'react'
import { REDUCED_TRANSPARENCY_QUERY } from './useSystemReducedTransparency'
import './IslandGlassOptic.css'

const solidMaterialQuery = `${REDUCED_TRANSPARENCY_QUERY}, (forced-colors: active), (prefers-contrast: more)`

function subscribeVisibility(update: () => void) {
  document.addEventListener('visibilitychange', update)
  return () => document.removeEventListener('visibilitychange', update)
}

function FittedLens() {
  const [preference] = useState(() => globalThis.matchMedia?.(solidMaterialQuery))
  const subscribePreference = useCallback((update: () => void) => {
    preference?.addEventListener('change', update)
    return () => preference?.removeEventListener('change', update)
  }, [preference])
  const visible = useSyncExternalStore(subscribeVisibility, () => !document.hidden, () => false)
  const solid = useSyncExternalStore(subscribePreference, () => preference?.matches ?? false, () => true)
  return visible && !solid ? <Glass /> : null
}

/** Static shape-fitted Glisse bezel. Sibling artwork is the in-page backdrop.
 * Keep controls and text outside this decorative layer so neither is refracted. */
export const IslandGlassOptic = memo(function IslandGlassOptic({ active = true, className = '' }: {
  active?: boolean
  className?: string
}) {
  return <div className={`island-glass-optic ${className}`.trim()} aria-hidden="true">
    {active && <FittedLens />}
  </div>
})
