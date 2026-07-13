import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, X } from 'lucide-react'
import { copyDiagnostics } from './app/tauriApi'
import { useIslandApp } from './app/useIslandApp'
import { OverlayShell } from './features/overlay/OverlayShell'
import { SettingsPanel } from './features/settings/SettingsPanel'
import './App.css'

function App() {
  const windowLabel = isTauriRuntime() ? getCurrentWindow().label : 'main'
  const app = useIslandApp()

  if (windowLabel === 'settings') {
    if (!app.config) {
      return <main className="settings-window-root">Loading settings...</main>
    }

    return (
      <main className="settings-window-root">
        <header className="settings-titlebar" data-tauri-drag-region>
          <strong data-tauri-drag-region>Music Island</strong>
          <div className="settings-window-actions">
            <button type="button" aria-label="Свернуть" onClick={() => void getCurrentWindow().minimize()}><Minus /></button>
            <button type="button" aria-label="Закрыть" onClick={() => void getCurrentWindow().hide()}><X /></button>
          </div>
        </header>
        <div className="settings-scroll">
          <SettingsPanel
            config={app.config}
            updateMessage={app.updateMessage}
            smtcHealth={app.smtcHealth}
            mediaSessions={app.mediaSessions}
            onChange={(nextConfig) => void app.updateConfig(nextConfig)}
            onResetPosition={() => void app.resetPosition()}
            onCheckUpdates={() => void app.checkUpdates()}
            onCopyDiagnostics={() => void copyDiagnostics().then((text) => navigator.clipboard?.writeText(text))}
            onRefreshSources={() => void app.refreshMediaSessions()}
          />
        </div>
      </main>
    )
  }

  return <OverlayShell app={app} />
}

function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window
}

export default App
