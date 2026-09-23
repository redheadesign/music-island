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

    // A scope may stay mounted while hidden. Reset the newly selected content,
    // leaving the navigation and title bar fixed in place.
    const containers = panelRef.current?.querySelectorAll<HTMLElement>('[data-settings-scroll]')
    containers?.forEach((container) => { container.scrollTop = 0; container.classList.remove('settings-content--enter'); void container.offsetWidth; container.classList.add('settings-content--enter') })
  }, [page, panelRef])
}
