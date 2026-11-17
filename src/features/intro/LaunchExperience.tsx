import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { AppConfig } from '../../shared/lib/types'
import { getInterfaceTheme, getSettingsColorScheme } from '../../shared/lib/uiPrefs'
import { Button, Notice } from '../../shared/ui/SettingsControls'
import { Onboarding } from './Onboarding'
import { IntroSplash } from './IntroSplash'

type LaunchState = { config: AppConfig; dictationShortcut?: [string, string] | null; onboarding: boolean; generation: number; exePath?: string | null }
export function LaunchExperience() {
  const [state, setState] = useState<LaunchState | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const receive = useCallback((next: LaunchState) => {
    setState(current => !current || next.generation >= current.generation ? next : current)
    setError(false)
  }, [])
  useEffect(() => {
    let active = true
    let dispose: (() => void) | undefined
    void (async () => {
      const unsubscribe = await listen<LaunchState>('intro:replay', ({ payload }) => { if (active) receive(payload) })
      if (!active) { unsubscribe(); return }
      dispose = unsubscribe
      const initial = await invoke<LaunchState>('get_launch_state')
      if (active) receive(initial)
    })().catch(() => { if (active) setError(true) })
    return () => { active = false; dispose?.() }
  }, [receive, attempt])
  const ru = state ? state.config.appearance.locale !== 'en' : (navigator.languages?.[0] || navigator.language || 'ru').toLowerCase().split('-')[0] === 'ru'
  if (error) return <div className="onboarding" data-color-scheme={getSettingsColorScheme(state?.config)} data-interface-theme={getInterfaceTheme(state?.config)}><Notice tone="danger" action={<Button onClick={() => { setError(false); setAttempt(value => value + 1) }}>{ru ? 'Повторить' : 'Retry'}</Button>}>{ru ? 'Не удалось открыть знакомство.' : 'Could not open the introduction.'}</Notice></div>
  if (!state) return null
  return state.onboarding ? <Onboarding key={state.generation} config={state.config} exePath={state.exePath} dictationShortcut={state.dictationShortcut} onFinish={async (enableAutostart) => {
    await invoke('finish_onboarding', { generation: state.generation, enableAutostart: enableAutostart ?? null })
    setState(current => current?.generation === state.generation ? { ...current, onboarding: false } : current)
  }} /> : <IntroSplash key={state.generation} generation={state.generation} reducedMotion={state.config.appearance.reducedMotion} />
}
