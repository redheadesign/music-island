// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { invoke } from '@tauri-apps/api/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalServer } from '../../shared/lib/localServerTypes'
import { useLocalServersController, type LocalServersController } from './useLocalServersController'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

const server: LocalServer = { id: 'vite-5173', pid: 12684, processName: 'node.exe', host: '127.0.0.1', port: 5173, canStop: true }

describe('local servers polling', () => {
  let root: Root
  let current: LocalServersController

  function Harness({ enabled }: { enabled: boolean }) {
    current = useLocalServersController(enabled)
    return null
  }

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('__TAURI_INTERNALS__', {})
    vi.useFakeTimers()
    root = createRoot(document.createElement('div'))
  })

  afterEach(async () => {
    await act(() => root.unmount())
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.mocked(invoke).mockReset()
  })

  it('scans only when enabled and ignores an unfinished scan after disabling', async () => {
    let finishScan!: (rows: LocalServer[]) => void
    vi.mocked(invoke).mockReturnValue(new Promise<LocalServer[]>((resolve) => { finishScan = resolve }))

    await act(() => root.render(<Harness enabled={false} />))
    expect(invoke).not.toHaveBeenCalled()

    await act(() => root.render(<Harness enabled />))
    expect(invoke).toHaveBeenCalledExactlyOnceWith('list_local_servers')

    await act(() => root.render(<Harness enabled={false} />))
    await act(async () => {
      finishScan([server])
      await vi.advanceTimersByTimeAsync(6_000)
    })
    expect(current.servers).toEqual([])
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('stops each process once and keeps rows for processes that failed to stop', async () => {
    const secondPort = { ...server, id: 'vite-4173', port: 4173 }
    const otherProcess = { ...server, id: 'vite-8000', pid: 9000, port: 8000 }
    const rows = [server, secondPort, otherProcess]
    vi.mocked(invoke).mockResolvedValueOnce(rows)
    await act(() => root.render(<Harness enabled />))

    vi.mocked(invoke).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Access denied'))
    await act(async () => {
      await expect(current.stopAll(rows)).rejects.toThrow()
    })

    expect(vi.mocked(invoke).mock.calls.slice(1)).toEqual([
      ['stop_local_server', { id: server.id }],
      ['stop_local_server', { id: otherProcess.id }],
    ])
    expect(current.servers).toEqual([otherProcess])
  })
})
