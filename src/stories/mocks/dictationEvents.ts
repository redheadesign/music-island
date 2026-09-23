import type { EventCallback, UnlistenFn } from '@tauri-apps/api/event'
export async function listenDictationEvent<T>(_name: string, _callback: EventCallback<T>): Promise<UnlistenFn> { return () => {} }
