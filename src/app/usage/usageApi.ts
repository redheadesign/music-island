import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  UsageProvider,
  UsageProviderSnapshot,
  UsageSnapshot,
} from '../../shared/lib/usageTypes'

const disabled = (provider: UsageProvider): UsageProviderSnapshot => ({
  provider,
  source: provider === 'codex' ? 'codex-app-server' : 'claude-oauth',
  state: 'disabled',
  windows: [],
  plan: null,
  fetchedAt: null,
  staleSince: null,
  messageCode: null,
})

let previewSnapshot: UsageSnapshot = {
  codex: disabled('codex'),
  claude: disabled('claude'),
}

const isTauriRuntime = () => '__TAURI_INTERNALS__' in window

export async function getUsageSnapshot(): Promise<UsageSnapshot> {
  return isTauriRuntime()
    ? invoke<UsageSnapshot>('usage_get_snapshot')
    : previewSnapshot
}

export async function connectUsageProvider(provider: UsageProvider): Promise<UsageSnapshot> {
  if (isTauriRuntime()) return invoke<UsageSnapshot>('usage_connect', { provider })
  const unavailable: UsageProviderSnapshot = {
    ...disabled(provider),
    state: 'unavailable',
    messageCode: 'not-installed',
  }
  previewSnapshot = { ...previewSnapshot, [provider]: unavailable }
  return previewSnapshot
}

export async function disconnectUsageProvider(provider: UsageProvider): Promise<UsageSnapshot> {
  if (isTauriRuntime()) return invoke<UsageSnapshot>('usage_disconnect', { provider })
  previewSnapshot = { ...previewSnapshot, [provider]: disabled(provider) }
  return previewSnapshot
}

export async function refreshUsageProvider(provider: UsageProvider): Promise<UsageSnapshot> {
  return isTauriRuntime()
    ? invoke<UsageSnapshot>('usage_refresh', { provider })
    : previewSnapshot
}

/** Call only from the single config lifecycle owner, after authoritative config load/save. */
export async function onUsageSnapshot(
  callback: (snapshot: UsageSnapshot) => void,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined
  return listen<UsageSnapshot>('usage:snapshot', (event) => callback(event.payload))
}
