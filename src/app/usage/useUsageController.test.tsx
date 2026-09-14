// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageProvider, UsageSnapshot } from '../../shared/lib/usageTypes'
import * as api from './usageApi'
import { useUsageController } from './useUsageController'

vi.mock('./usageApi', () => ({
  connectUsageProvider: vi.fn(),
  disconnectUsageProvider: vi.fn(),
  getUsageSnapshot: vi.fn(),
  onUsageSnapshot: vi.fn(),
  refreshUsageProvider: vi.fn(),
}))

function provider(provider: UsageProvider, usedPercent: number) {
  return {
    provider,
    source: provider === 'codex' ? 'codex-app-server' as const : 'claude-oauth' as const,
    state: 'connected' as const,
    windows: [{
      id: 'weekly',
      label: 'Weekly',
      usedPercent,
      remainingPercent: 100 - usedPercent,
      windowDurationMinutes: 10_080,
      resetsAt: 1_800_000_000,
    }],
    plan: 'pro',
    fetchedAt: 1_700_000_000 + usedPercent,
    staleSince: null,
    messageCode: null,
  }
}

function snapshot(usedPercent: number): UsageSnapshot {
  return {
    codex: provider('codex', usedPercent),
    claude: provider('claude', usedPercent),
  }
}

let root: Root
let container: HTMLDivElement
let current: ReturnType<typeof useUsageController>

function Probe({ enabled = true }: { enabled?: boolean }) {
  current = useUsageController(enabled)
  return null
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.mocked(api.onUsageSnapshot).mockResolvedValue(vi.fn())
  vi.mocked(api.connectUsageProvider).mockResolvedValue(snapshot(40))
  vi.mocked(api.disconnectUsageProvider).mockResolvedValue(snapshot(40))
  vi.mocked(api.refreshUsageProvider).mockResolvedValue(snapshot(40))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('usage controller snapshot ordering', () => {
  it('subscribes before reading the startup cache so a completed probe cannot be missed', async () => {
    let finishSubscription!: (cleanup: () => void) => void
    vi.mocked(api.onUsageSnapshot).mockImplementation(() => new Promise((resolve) => {
      finishSubscription = resolve
    }))
    vi.mocked(api.getUsageSnapshot).mockResolvedValue(snapshot(72))

    await act(async () => root.render(<Probe />))
    expect(api.onUsageSnapshot).toHaveBeenCalledOnce()
    expect(api.getUsageSnapshot).not.toHaveBeenCalled()

    await act(async () => finishSubscription(vi.fn()))

    expect(api.getUsageSnapshot).toHaveBeenCalledOnce()
    expect(current.snapshot?.codex.windows[0].usedPercent).toBe(72)
  })

  it('does not let a late initial snapshot overwrite a newer native event', async () => {
    let resolveInitial!: (value: UsageSnapshot) => void
    vi.mocked(api.getUsageSnapshot).mockImplementation(() => new Promise((resolve) => {
      resolveInitial = resolve
    }))
    let emit!: (value: UsageSnapshot) => void
    vi.mocked(api.onUsageSnapshot).mockImplementation(async (callback) => {
      emit = callback
      return vi.fn<() => void>()
    })

    await act(async () => root.render(<Probe />))
    await act(async () => emit(snapshot(72)))
    expect(current.snapshot?.codex.windows[0].usedPercent).toBe(72)

    await act(async () => resolveInitial(snapshot(18)))
    expect(current.snapshot?.codex.windows[0].usedPercent).toBe(72)
  })

  it('does not let a late initial snapshot overwrite an action result', async () => {
    let resolveInitial!: (value: UsageSnapshot) => void
    vi.mocked(api.getUsageSnapshot).mockImplementation(() => new Promise((resolve) => {
      resolveInitial = resolve
    }))
    vi.mocked(api.refreshUsageProvider).mockResolvedValue(snapshot(64))

    await act(async () => root.render(<Probe />))
    await act(async () => current.refresh('codex'))
    expect(current.snapshot?.codex.windows[0].usedPercent).toBe(64)
    expect(current.busyProvider).toBeNull()

    await act(async () => resolveInitial(snapshot(12)))
    expect(current.snapshot?.codex.windows[0].usedPercent).toBe(64)
  })

  it('does not read or subscribe while disabled', async () => {
    await act(async () => root.render(<Probe enabled={false} />))

    expect(api.getUsageSnapshot).not.toHaveBeenCalled()
    expect(api.onUsageSnapshot).not.toHaveBeenCalled()
    expect(current.snapshot).toBeNull()
    expect(current.busyProvider).toBeNull()
  })
})
