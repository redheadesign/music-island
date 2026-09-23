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

export function useDictationController(active: boolean, enabled = false) {
  const [data, setData] = useState<DictationData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const revision = useRef(0)
  const historyLimit = useRef(50)
  const mounted = useRef(true)
  const session = useRef(0)
  const invalidatePending = useCallback(() => { revision.current++ }, [])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; invalidatePending() } }, [invalidatePending])
  const refresh = useCallback(async () => {
    if (!mounted.current) return
    const generation = ++revision.current
    const [settings, models, microphones, history, path, modelStatus, status] = await Promise.all([
      dictationApi.getAppSettings(), dictationApi.getAvailableModels(), dictationApi.getAvailableMicrophones(),
      readHistory(historyLimit.current), dictationApi.getAppDirPath(), dictationApi.getModelLoadStatus(), dictationApi.getStatus(),
    ])
    if (mounted.current && generation === revision.current) setData(current => ({ settings, models, microphones, history: history.entries, hasMoreHistory: history.has_more, path, modelStatus, status: current?.status && current.status.revision > status.revision ? current.status : status }))
  }, [])
  const run = useCallback(async (id: string, action: () => Promise<unknown>) => {
    const operationSession = session.current
    setBusy(id); setError(null)
    try { await action(); if (operationSession === session.current) await refresh() }
    catch (reason) { if (mounted.current && operationSession === session.current) setError(String(reason)); throw reason }
    finally { if (mounted.current && operationSession === session.current) setBusy((current) => current === id ? null : current) }
  }, [refresh])
  const enable = useCallback(() => { return run('enable', () => dictationApi.initialize()) }, [run])
  const disable = useCallback(async () => {
    session.current++; invalidatePending()
    setBusy('disable'); setProgress({})
    try { await dictationApi.suspend(); await refresh() }
    finally { if (mounted.current) setBusy((current) => current === 'disable' ? null : current) }
  }, [invalidatePending, refresh])
  const loadMoreHistory = useCallback(async () => { historyLimit.current += 50; await refresh() }, [refresh])
  useEffect(() => { if (!active) return; void (enabled ? enable() : refresh()).catch((reason) => setError(String(reason))) }, [active, enabled, enable, refresh])
  useEffect(() => {
    if (!active || !data) return
    let alive = true
    const cleanup: (() => void)[] = []
    const register = async (event: string, callback: (payload: unknown) => void) => {
      const dispose = await listen(event, ({ payload }) => { if (alive) callback(payload) })
      if (alive) cleanup.push(dispose); else dispose()
    }
    const update = () => { void refresh().catch((reason) => { if (alive) setError(String(reason)) }) }
    void Promise.all([
      register('models-updated', update), register('model-deleted', update), register('model-download-cancelled', update), register('model-download-failed', update),
      register('dictation:status', (payload) => { const status = payload as DictationStatus; setData((current) => current && (!current.status || status.revision > current.status.revision) ? { ...current, status } : current) }),
      register('model-state-changed', update), register('model-download-complete', update),
      register('history-update-payload', update), register('model-download-progress', (payload) => {
        const event = payload as { model_id: string; percentage: number }
        setProgress((current) => ({ ...current, [event.model_id]: event.percentage }))
      }),
    ]).catch((reason) => { if (alive) setError(String(reason)) })
    return () => { alive = false; cleanup.forEach((dispose) => dispose()) }
    // Subscriptions follow visibility and initialization, not every settings snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, Boolean(data), refresh])
  return { enabled, data, busy, error, progress, enable, disable, refresh, loadMoreHistory, run, api: dictationApi }
}

export type DictationController = ReturnType<typeof useDictationController>
