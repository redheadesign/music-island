import { useCallback, useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { UpdateCheckResult } from '../../shared/lib/types'
import type { OverlayMode } from '../islandApp.types'
import {
  checkForUpdates,
  onOverlayAction,
  openSettingsWindow,
  resetWindowPosition,
} from '../tauriApi'

interface WindowController {
  updateMessage: string | null
  resetPosition: () => Promise<void>
  openSettingsWindow: () => Promise<void>
  checkUpdates: () => Promise<UpdateCheckResult>
}

export function useWindowController(
  mediaEnabled: boolean,
  setMode: Dispatch<SetStateAction<OverlayMode>>,
): WindowController {
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!mediaEnabled) return
    let cleanupSettings: () => void = () => undefined
    let cleanupUpdates: () => void = () => undefined

    void onOverlayAction('open-settings', () => {
      setMode('settings')
      void openSettingsWindow()
    }).then((unlisten) => {
      cleanupSettings = unlisten
    })
    void onOverlayAction('check-updates', () => {
      void checkForUpdates().then((result) => setUpdateMessage(result.message))
    }).then((unlisten) => {
      cleanupUpdates = unlisten
    })

    return () => {
      cleanupSettings()
      cleanupUpdates()
    }
  }, [mediaEnabled, setMode])

  const checkUpdates = useCallback(async () => {
    const result = await checkForUpdates()
    setUpdateMessage(result.message)
    return result
  }, [])

  return {
    updateMessage,
    resetPosition: resetWindowPosition,
    openSettingsWindow,
    checkUpdates,
  }
}
