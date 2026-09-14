import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

/** Resets the settings window's real scroll owner before a newly selected page paints. */
export function useResetSettingsScrollOnChange(
  page: string,
  panelRef: RefObject<HTMLElement | null>,
): void {
  const previousPage = useRef(page)

  useLayoutEffect(() => {
    if (previousPage.current === page) return
    previousPage.current = page

    const scrollContainer = panelRef.current?.closest<HTMLElement>('.settings-scroll')
    if (scrollContainer) scrollContainer.scrollTop = 0
  }, [page, panelRef])
}
