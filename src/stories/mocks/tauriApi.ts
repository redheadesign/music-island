import type { DirectYandexStatus, TaskbarStatus, MonitorSnapshot } from '../../shared/lib/types'

// The Storybook resolver lets this re-export reach the real browser adapter.
export * from '../../app/tauriApi'

const disabled: DirectYandexStatus = { state: 'disabled', message: '', port: null, executablePath: null }
let direct = { ...disabled }
let taskbar: TaskbarStatus = { state: 'off' }
const defaultMonitors: MonitorSnapshot = { revision: 1, preferredId: null, activeId: 'display-main', monitors: [
  { id: 'display-main', name: '1 · Display', x: 0, y: 0, width: 2560, height: 1440, scaleFactor: 1.25, primary: true },
  { id: 'display-portrait', name: '2 · Display', x: -1080, y: 0, width: 1080, height: 1920, scaleFactor: 1, primary: false },
] }
let monitors = defaultMonitors
export async function getMonitorSnapshot() { return monitors }
export async function onMonitorsChanged(_callback: (snapshot: MonitorSnapshot) => void) { return () => {} }
const listeners = new Set<(value: DirectYandexStatus) => void>()

export function resetNativePreview(options: { direct?: DirectYandexStatus; taskbar?: TaskbarStatus; monitors?: MonitorSnapshot } = {}) {
  monitors = options.monitors ?? defaultMonitors
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

export async function replayOnboarding(): Promise<void> {}
