import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { OverlayMode } from '../islandApp.types'
import { onOverlayAction, openSettingsWindow, resetWindowPosition } from '../tauriApi'

interface WindowController {
  resetPosition: () => Promise<void>
  openSettingsWindow: () => Promise<void>
}

export function useWindowController(
  mediaEnabled: boolean,
  setMode: Dispatch<SetStateAction<OverlayMode>>,
): WindowController {
  useEffect(() => {
    if (!mediaEnabled) return
    let cleanupSettings: () => void = () => undefined

    void onOverlayAction('open-settings', () => {
      setMode('settings')
      void openSettingsWindow()
    }).then((unlisten) => {
      cleanupSettings = unlisten
    })

    return () => {
      cleanupSettings()
    }
  }, [mediaEnabled, setMode])

  return {
    resetPosition: resetWindowPosition,
    openSettingsWindow,
  }
}
