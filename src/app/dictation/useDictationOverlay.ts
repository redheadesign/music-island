import { useEffect, useRef, useState } from 'react'
import { listenDictationEvent as listen } from './dictationEvents'
import { dictationApi } from './dictationApi'
import { getConfig, onConfigChanged } from '../tauriApi'
import type { DictationStatus } from '../../shared/lib/dictationTypes'
import type { AppConfig } from '../../shared/lib/types'
import { defaultDictationAppearance, getDictationAppearance } from '../../shared/lib/dictationAppearance'
import { applyAccentTheme } from '../../shared/lib/accentTheme'
import { getInterfaceTheme } from '../../shared/lib/uiPrefs'
export function useDictationOverlay() {
  const [status, setStatus] = useState<DictationStatus>({ revision: 0, operationId: 0, phase: 'idle', ready: false, text: '', error: null })
  const [visible, setVisible] = useState(false)
  const [live, setLive] = useState(false)
  const operation = useRef(0)
  const [levels, setLevels] = useState<number[]>([])
  const [text, setText] = useState({ committed: '', tentative: '' })
  const [preferences, setPreferences] = useState({
    locale: 'ru' as 'ru' | 'en', reducedMotion: false, appearance: defaultDictationAppearance, interfaceTheme: getInterfaceTheme(undefined),
  })
  useEffect(() => {
    let alive = true
    const cleanup: (() => void)[] = []
    const subscribe = async <T,>(name: string, callback: (payload: T) => void) => {
      const dispose = await listen<T>(name, ({ payload }) => { if (alive) callback(payload) })
      if (alive) cleanup.push(dispose); else dispose()
    }
    let revision = -1
    const update = (next: DictationStatus) => {
      if (next.revision <= revision) return
      revision = next.revision
      if (next.operationId !== operation.current) setText({ committed: '', tentative: '' })
      operation.current = next.operationId
      if (next.phase === 'recording' || next.phase === 'streaming') setLive(next.phase === 'streaming')
      setStatus(next)
    }
    void Promise.all([
      subscribe<DictationStatus>('dictation:status', update),
      subscribe<string>('show-overlay', (state) => { setVisible(true); setLive(state === 'streaming'); setLevels([]); setText({ committed: '', tentative: '' }) }),
      subscribe('hide-overlay', () => setVisible(false)),
      subscribe<number[]>('mic-level', setLevels),
      subscribe<{ operation_id: number; committed: string; tentative: string }>('stream-text-event', (next) => { if (next.operation_id === operation.current) setText(next) }),
    ]).then(async () => { const next = await dictationApi.getStatus(); if (alive && next.revision > revision) { update(next); setVisible(['preparing', 'recording', 'streaming', 'transcribing', 'processing'].includes(next.phase)); setLive(next.phase === 'streaming') } }).catch(() => {})
    let changed = false
    const applyPreferences = (config: AppConfig) => {
      if (!alive) return
      applyAccentTheme(config.appearance.accentColor)
      setPreferences({
        locale: config.appearance.locale, reducedMotion: config.appearance.reducedMotion,
        appearance: getDictationAppearance(config), interfaceTheme: getInterfaceTheme(config),
      })
    }
    // Subscribe before reading the store, so a theme changed during window startup
    // cannot be replaced by an older cache read. Hidden overlay windows stay in sync.
    void onConfigChanged(config => { changed = true; applyPreferences(config) }).then(async dispose => {
      if (!alive) { dispose(); return }
      cleanup.push(dispose)
      const config = await getConfig()
      if (!changed) applyPreferences(config)
    }).catch(() => {})
    return () => { alive = false; cleanup.forEach((dispose) => dispose()) }
  }, [])
  return { status, visible, levels, text: live ? text : { committed: '', tentative: '' }, ...preferences, finish: () => dictationApi.toggle(), cancel: dictationApi.cancelOperation, copy: () => dictationApi.copyResult(status.operationId) }
}
