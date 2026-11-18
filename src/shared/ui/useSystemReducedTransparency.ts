import { useCallback, useState, useSyncExternalStore } from 'react'

export const REDUCED_TRANSPARENCY_QUERY = '(prefers-reduced-transparency: reduce)'

export function useSystemReducedTransparency(): boolean {
  const [media] = useState(() => globalThis.matchMedia?.(REDUCED_TRANSPARENCY_QUERY))
  const subscribe = useCallback((update: () => void) => {
    media?.addEventListener('change', update)
    return () => media?.removeEventListener('change', update)
  }, [media])
  return useSyncExternalStore(subscribe, () => media?.matches ?? false, () => false)
}
