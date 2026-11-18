import { useCallback, useEffect, useRef, useState } from 'react'
import { listenDictationEvent as listen } from './dictationEvents'
import { dictationApi } from './dictationApi'
import type { AppSettings, AudioDevice, HistoryEntry, ModelInfo, ModelLoadStatus, DictationStatus } from '../../shared/lib/dictationTypes'

export interface DictationData {
  settings: AppSettings
  models: ModelInfo[]
  microphones: AudioDevice[]
  history: HistoryEntry[]
  hasMoreHistory?: boolean
  path: string
  modelStatus?: ModelLoadStatus
  status?: DictationStatus
}

async function readHistory(limit: number) {
  const entries: HistoryEntry[] = []
  let has_more = true
  while (entries.length < limit && has_more) {
    const page = await dictationApi.getHistoryEntries(entries.at(-1)?.id ?? null, Math.min(100, limit - entries.length))
    entries.push(...page.entries)
    has_more = page.has_more && page.entries.length > 0
  }
  return { entries, has_more }
}

type DictationDomain = 'settings' | 'models' | 'history' | 'devices' | 'runtime'
type AfterAction = DictationDomain | 'all' | 'none' | readonly DictationDomain[]
const allDomains: readonly DictationDomain[] = ['settings', 'models', 'history', 'devices', 'runtime']

export function useDictationController(active: boolean, enabled = false) {
  const [data, setData] = useState<DictationData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const cached = useRef<DictationData | null>(null)
  const latestStatus = useRef<DictationStatus | undefined>(undefined)
  const versions = useRef<Record<DictationDomain, number>>({ settings: 0, models: 0, history: 0, devices: 0, runtime: 0 })
  const paging = useRef(false)
  const mounted = useRef(true)
  const session = useRef(0)
  const updateData = useCallback((value: DictationData) => { cached.current = value; setData(value) }, [])
  useEffect(() => {
    mounted.current = true
    session.current++
    return () => { mounted.current = false }
  }, [])

  const refresh = useCallback(async (after: AfterAction = 'all') => {
    if (!mounted.current || after === 'none') return
    const initial = cached.current
    const domains = !initial || after === 'all' ? allDomains : typeof after === 'string' ? [after] : after
    const operationSession = session.current
    const changes = await Promise.all(domains.map(async domain => {
      const version = ++versions.current[domain]
      let patch: Partial<DictationData>
      switch (domain) {
        case 'settings': patch = { settings: await dictationApi.getAppSettings() }; break
        case 'models': patch = { models: await dictationApi.getAvailableModels() }; break
        case 'history': {
          const page = await readHistory(Math.max(50, initial?.history.length ?? 0))
          patch = { history: page.entries, hasMoreHistory: page.has_more }
          break
        }
        case 'devices': patch = { microphones: await dictationApi.getAvailableMicrophones() }; break
        case 'runtime': {
          const [modelStatus, status] = await Promise.all([dictationApi.getModelLoadStatus(), dictationApi.getStatus()])
          patch = { modelStatus, status }
          break
        }
      }
      return { domain, version, patch }
    }))
    const path = initial?.path ?? await dictationApi.getAppDirPath()
    if (!mounted.current || session.current !== operationSession) return
    const current = cached.current
    const fresh = changes.filter(change => versions.current[change.domain] === change.version)
    if (!fresh.length || (!current && fresh.length !== allDomains.length)) return
    const next: DictationData = Object.assign({ path }, current, ...fresh.map(change => change.patch))
    const latest = latestStatus.current
    if (latest && (!next.status || latest.revision > next.status.revision)) next.status = latest
    updateData(next)
  }, [updateData])

  const run = useCallback(async (id: string, action: () => Promise<unknown>, after: AfterAction = 'settings', report = true) => {
    const operationSession = session.current
    setBusy(id); setError(null)
    try {
      await action()
      if (operationSession === session.current) await refresh(after)
    } catch (reason) {
      if (report && mounted.current && operationSession === session.current) setError(String(reason))
      throw reason
    } finally {
      if (mounted.current && operationSession === session.current) setBusy(current => current === id ? null : current)
    }
  }, [refresh])
  const enable = useCallback(() => run('enable', () => dictationApi.initialize(), 'all'), [run])
  const disable = useCallback(async () => {
    session.current++
    setProgress({})
    await run('disable', () => dictationApi.suspend(), 'all')
  }, [run])
  const loadMoreHistory = useCallback(async () => {
    const current = cached.current
    if (paging.current || !current?.hasMoreHistory) return
    const cursor = current.history.at(-1)?.id
    if (cursor == null) return
    const operationSession = session.current
    const version = versions.current.history
    paging.current = true
    try {
      const page = await dictationApi.getHistoryEntries(cursor, 50)
      const snapshot = cached.current
      if (!mounted.current || operationSession !== session.current || version !== versions.current.history || snapshot?.history.at(-1)?.id !== cursor) return
      updateData({ ...snapshot, history: [...snapshot.history, ...page.entries], hasMoreHistory: page.has_more && page.entries.length > 0 })
    } finally { paging.current = false }
  }, [updateData])
  useEffect(() => {
    if (!active) return
    let alive = true
    const cleanup: (() => void)[] = []
    const register = async (event: string, callback: (payload: unknown) => void) => {
      const dispose = await listen(event, ({ payload }) => { if (alive) callback(payload) })
      if (alive) cleanup.push(dispose); else dispose()
    }
    const failed = (reason: unknown) => { if (alive) setError(String(reason)) }
    const modelsChanged = () => { void refresh(['models', 'settings', 'runtime']).catch(failed) }
    const historyChanged = () => { void refresh('history').catch(failed) }
    void Promise.all([
      register('models-updated', modelsChanged), register('model-deleted', modelsChanged),
      register('model-download-cancelled', modelsChanged), register('model-download-failed', modelsChanged),
      register('model-state-changed', payload => {
        const type = (payload as { event_type?: string } | null)?.event_type
        if (type === 'loading_completed' || type === 'selection_changed') modelsChanged()
        else void refresh('runtime').catch(failed)
      }),
      register('model-download-complete', modelsChanged), register('history-update-payload', historyChanged),
      register('dictation:status', payload => {
        const status = payload as DictationStatus
        if (latestStatus.current && latestStatus.current.revision >= status.revision) return
        latestStatus.current = status
        const current = cached.current
        if (current && (!current.status || status.revision > current.status.revision)) updateData({ ...current, status })
      }),
      register('model-download-progress', payload => {
        const event = payload as { model_id: string; percentage: number }
        setProgress(current => ({ ...current, [event.model_id]: event.percentage }))
      }),
    ]).catch(failed).then(() => {
      if (alive) void (enabled ? enable() : refresh()).catch(failed)
    })
    return () => { alive = false; cleanup.forEach(dispose => dispose()) }
  }, [active, enabled, enable, refresh, updateData])
  return { enabled, data, busy, error, progress, enable, disable, refresh, loadMoreHistory, run, api: dictationApi }
}

export type DictationController = ReturnType<typeof useDictationController>
