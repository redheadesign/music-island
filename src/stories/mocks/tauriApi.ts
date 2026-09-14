import type { DirectYandexStatus, TaskbarStatus } from '../../shared/lib/types'

// The Storybook resolver lets this re-export reach the real browser adapter.
export * from '../../app/tauriApi'

const disabled: DirectYandexStatus = { state: 'disabled', message: '', port: null, executablePath: null }
let direct = { ...disabled }
let taskbar: TaskbarStatus = { state: 'off' }
const listeners = new Set<(value: DirectYandexStatus) => void>()

export function resetNativePreview(options: { direct?: DirectYandexStatus; taskbar?: TaskbarStatus } = {}) {
  direct = { ...(options.direct ?? disabled) }
  taskbar = options.taskbar ?? { state: 'off' }
  listeners.clear()
}
export async function getDirectYandexStatus() { return direct }
export async function onDirectYandexStatus(callback: (status: DirectYandexStatus) => void) {
  listeners.add(callback)
  return () => { listeners.delete(callback) }
}
export async function enableDirectYandex(): Promise<DirectYandexStatus> {
  direct = { state: 'connected', message: '', port: 9222, executablePath: null }
  listeners.forEach((callback) => callback(direct))
  return direct
}
export async function disableDirectYandex(): Promise<DirectYandexStatus> {
  direct = { ...disabled }
  listeners.forEach((callback) => callback(direct))
  return direct
}
export async function getTaskbarStatus() { return taskbar }
export async function onTaskbarStatus(_callback: (status: TaskbarStatus) => void) { return () => {} }
// Story interactions never launch an installed desktop application.
export async function openSpotify() {}
