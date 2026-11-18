import { useEffect, useRef, useState } from 'react'
import type { SystemVolumeAction, SystemVolumeSnapshot } from '../../shared/lib/systemVolume'
import { controlSystemVolume } from '../tauriApi'

type WriteAction = Exclude<SystemVolumeAction, { kind: 'read' }>

export function useSystemVolume(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<SystemVolumeSnapshot | null>(null)
  const controls = useRef<{ toggleMute(): void; setVolume(value: number): void } | null>(null)

  useEffect(() => {
    if (!enabled) return
    let current: SystemVolumeSnapshot | null = null
    let active = true
    let busy = false
    let timer: number | undefined
    const pending: WriteAction[] = []

    function publish(next: SystemVolumeSnapshot | null) {
      if (!active) return
      current = next
      setSnapshot(prev => prev?.endpointId === next?.endpointId && prev?.volume === next?.volume
        && prev?.muted === next?.muted ? prev : next)
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
      if (!current) return
      publish(action.kind === 'toggleMute'
        ? { ...current, muted: !current.muted }
        : { ...current, volume: action.volume })
      if (!busy) {
        void run(action)
        return
      }
      // While one IPC is in flight, keep only the last consecutive slider position.
      if (action.kind === 'setVolume' && pending.at(-1)?.kind === 'setVolume') pending.pop()
      pending.push(action)
    }

    controls.current = {
      toggleMute() {
        if (current) write({ kind: 'toggleMute', endpointId: current.endpointId })
      },
      setVolume(value) {
        if (!current || !Number.isFinite(value)) return
        const volume = Math.max(0, Math.min(100, Math.round(value)))
        if (volume !== current.volume) write({ kind: 'setVolume', endpointId: current.endpointId, volume })
      },
    }

    const refresh = () => { if (!busy) void run({ kind: 'read' }) }
    function syncVisibility() {
      window.clearInterval(timer)
      if (document.hidden) return
      refresh()
      timer = window.setInterval(refresh, 1000)
    }
    document.addEventListener('visibilitychange', syncVisibility)
    syncVisibility()
    return () => {
      active = false
      controls.current = null
      setSnapshot(null)
      document.removeEventListener('visibilitychange', syncVisibility)
      window.clearInterval(timer)
    }
  }, [enabled])

  return {
    volume: enabled ? snapshot?.volume ?? 0 : 0,
    muted: enabled && (snapshot?.muted ?? false),
    available: enabled && snapshot !== null,
    toggleMute: () => controls.current?.toggleMute(),
    setVolume: (value: number) => controls.current?.setVolume(value),
  }
}
