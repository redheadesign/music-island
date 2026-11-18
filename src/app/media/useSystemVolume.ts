import { useSyncExternalStore } from 'react'
import type { SystemVolumeAction, SystemVolumeSnapshot } from '../../shared/lib/systemVolume'
import { controlSystemVolume } from '../tauriApi'

type WriteAction = Exclude<SystemVolumeAction, { kind: 'read' }>

// The expanded island unmounts when it closes. Keep already-issued gestures in order
// across a close/reopen, and share one poll if the same control has multiple subscribers.
const listeners = new Set<() => void>()
const pending: WriteAction[] = []
let snapshot: SystemVolumeSnapshot | null = null
let busy = false
let timer: number | undefined

function publish(next: SystemVolumeSnapshot | null) {
  if (!listeners.size || (snapshot?.endpointId === next?.endpointId
    && snapshot?.volume === next?.volume && snapshot?.muted === next?.muted)) return
  snapshot = next
  listeners.forEach(listener => listener())
}

async function run(first: SystemVolumeAction) {
  busy = true
  try {
    let result = await controlSystemVolume(first)
    while (pending.length) {
      const action = pending.shift()!
      if (action.endpointId === result?.endpointId) result = await controlSystemVolume(action)
    }
    publish(result)
  } catch {
    pending.length = 0
    publish(null)
  } finally {
    busy = false
  }
}

function write(action: WriteAction) {
  if (!snapshot || snapshot.endpointId !== action.endpointId) return
  publish(action.kind === 'toggleMute'
    ? { ...snapshot, muted: !snapshot.muted }
    : { ...snapshot, volume: action.volume })
  if (!busy) {
    void run(action)
    return
  }
  // A drag can deliver samples faster than Windows can acknowledge an update.
  if (action.kind === 'setVolume' && pending.at(-1)?.kind === 'setVolume') pending.pop()
  pending.push(action)
}

function refresh() {
  if (!busy) void run({ kind: 'read' })
}

function syncVisibility() {
  window.clearInterval(timer)
  if (document.hidden) return
  refresh()
  timer = window.setInterval(refresh, 1000)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', syncVisibility)
    syncVisibility()
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size) return
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', syncVisibility)
    snapshot = null
  }
}

const getSnapshot = () => snapshot
const getUnavailable = () => null
const noop = () => {}
const subscribeDisabled = () => noop

export function useSystemVolume(enabled: boolean) {
  const current = useSyncExternalStore(enabled ? subscribe : subscribeDisabled,
    enabled ? getSnapshot : getUnavailable, getUnavailable)
  return {
    endpointId: current?.endpointId ?? null,
    volume: current?.volume ?? 0,
    muted: current?.muted ?? false,
    available: current !== null,
    toggleMute() {
      if (current) write({ kind: 'toggleMute', endpointId: current.endpointId })
    },
    setVolume(value: number) {
      if (!current || !Number.isFinite(value)) return
      const volume = Math.max(0, Math.min(100, Math.round(value)))
      if (volume !== snapshot?.volume) write({ kind: 'setVolume', endpointId: current.endpointId, volume })
    },
  }
}
