import { useCallback, useEffect, useState } from 'react'
import { dataApi } from './dataApi'
import { dictationApi } from '../dictation/dictationApi'
import type { DataSnapshot } from '../../shared/lib/dataTypes'
export function useDataController(active: boolean) {
  const [data, setData] = useState<DataSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useCallback(async () => { try { setData(await dataApi.snapshot()); setError(null) } catch (reason) { setError(String(reason)) } }, [])
  useEffect(() => { if (active) void refresh() }, [active, refresh])
  return { data, error, busy, refresh, open: async () => { try { await dataApi.open() } catch (reason) { setError(String(reason)) } }, remove: async (kind: 'models' | 'history' | 'all') => {
    setBusy(true); setError(null)
    try { if (kind === 'models') await dictationApi.removeAllModels(); else if (kind === 'history') await dictationApi.clearHistory(); else if (data) await dataApi.removeAll(data.confirmation); await refresh() }
    catch (reason) { setError(String(reason)) }
    finally { setBusy(false) }
  } }
}
