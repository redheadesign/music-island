import type { UsageProvider, UsageProviderSnapshot, UsageSnapshot } from '../../shared/lib/usageTypes'

const disabled = (provider: UsageProvider): UsageProviderSnapshot => ({
  provider,
  source: provider === 'codex' ? 'codex-app-server' : 'claude-oauth',
  state: 'disabled', windows: [], plan: null, fetchedAt: null, staleSince: null, messageCode: null,
})

let snapshot: UsageSnapshot = { codex: disabled('codex'), claude: disabled('claude') }
const listeners = new Set<(snapshot: UsageSnapshot) => void>()

const emit = () => listeners.forEach((listener) => listener(snapshot))
const connected = (provider: UsageProvider): UsageProviderSnapshot => ({
  ...disabled(provider), state: 'connected', fetchedAt: Math.floor(Date.now() / 1000),
  windows: [
    { id: 'primary', label: '5 h', usedPercent: 28, remainingPercent: 72, windowDurationMinutes: 300, resetsAt: null },
    { id: 'secondary', label: '7 d', usedPercent: 39, remainingPercent: 61, windowDurationMinutes: 10_080, resetsAt: null },
  ],
})

export async function getUsageSnapshot() { return snapshot }
export async function connectUsageProvider(provider: UsageProvider) { snapshot = { ...snapshot, [provider]: connected(provider) }; emit(); return snapshot }
export async function disconnectUsageProvider(provider: UsageProvider) { snapshot = { ...snapshot, [provider]: disabled(provider) }; emit(); return snapshot }
export async function refreshUsageProvider(_provider: UsageProvider) { return snapshot }
export async function onUsageSnapshot(callback: (value: UsageSnapshot) => void) { listeners.add(callback); return () => listeners.delete(callback) }
