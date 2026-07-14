import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  MediaSnapshot,
  WaveContext,
  WavePreset,
} from '../../shared/lib/types'
import {
  clearYandexWaveSelection,
  selectYandexWavePreset,
} from '../tauriApi'

/**
 * Wave preset carousel is intentionally disabled for the current UI pass.
 * Future: optional feature toggled in island settings (e.g. behavior.waveWheelEnabled).
 */
const WAVE_PRESET_CATALOG_ENABLED = false

interface OptimisticSelection {
  id: string | null
  title: string | null
}

export function useWaveController(media: MediaSnapshot | null) {
  const [optimistic, setOptimistic] = useState<OptimisticSelection | null>(null)
  const confirmationTimerRef = useRef<number | null>(null)
  const direct = media?.provider === 'yandex-direct' && media.hasSession

  const clearConfirmationTimer = useCallback(() => {
    if (confirmationTimerRef.current != null) {
      window.clearTimeout(confirmationTimerRef.current)
      confirmationTimerRef.current = null
    }
  }, [])

  const awaitConfirmation = useCallback(() => {
    clearConfirmationTimer()
    confirmationTimerRef.current = window.setTimeout(() => {
      setOptimistic(null)
      confirmationTimerRef.current = null
    }, 2_500)
  }, [clearConfirmationTimer])

  useEffect(() => {
    if (!direct) {
      clearConfirmationTimer()
      setOptimistic(null)
      return
    }
    if (
      optimistic
      && optimistic.id === media.activeWaveId
      && optimistic.title === media.activeWaveTitle
    ) {
      clearConfirmationTimer()
      setOptimistic(null)
    }
  }, [
    clearConfirmationTimer,
    direct,
    media?.activeWaveId,
    media?.activeWaveTitle,
    optimistic,
  ])

  useEffect(() => () => clearConfirmationTimer(), [clearConfirmationTimer])

  const refreshWaveContext = useCallback(async () => {
    if (!WAVE_PRESET_CATALOG_ENABLED) {
      return Promise.resolve()
    }
    // Future: listYandexWavePresets() when wave carousel is enabled in settings.
    return Promise.resolve()
  }, [])

  const selectWavePreset = useCallback(async (preset: WavePreset) => {
    if (!direct || !WAVE_PRESET_CATALOG_ENABLED) return
    setOptimistic({ id: preset.id, title: preset.title })
    awaitConfirmation()
    try {
      const result = await selectYandexWavePreset(preset.id)
      if (!result.supported || !result.applied) setOptimistic(null)
    } catch {
      setOptimistic(null)
    }
  }, [awaitConfirmation, direct])

  const clearWaveSelection = useCallback(async () => {
    if (!direct) return
    setOptimistic({ id: null, title: null })
    awaitConfirmation()
    try {
      const result = await clearYandexWaveSelection()
      if (!result.supported || !result.applied) setOptimistic(null)
    } catch {
      setOptimistic(null)
    }
  }, [awaitConfirmation, direct])

  const waveContext = useMemo<WaveContext | null>(() => {
    if (!direct) return null
    const activeId = optimistic ? optimistic.id : media.activeWaveId
    const activeTitle = optimistic ? optimistic.title : media.activeWaveTitle
    if (!activeTitle) return null
    return {
      isMyWave: true,
      supported: false,
      presets: [],
      active: {
        id: activeId ?? `context:${activeTitle}`,
        label: activeTitle,
        iconUrl: null,
        removable: true,
      },
    }
  }, [
    direct,
    media?.activeWaveId,
    media?.activeWaveTitle,
    optimistic,
  ])

  return {
    waveContext,
    refreshWaveContext,
    selectWavePreset,
    clearWaveSelection,
  }
}
