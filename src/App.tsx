import { getCurrentWindow } from '@tauri-apps/api/window'
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
        <SettingsPanel
          config={app.config}
          updateMessage={app.updateMessage}
          onChange={(nextConfig) => void app.updateConfig(nextConfig)}
          onResetPosition={() => void app.resetPosition()}
          onCheckUpdates={() => void app.checkUpdates()}
          onCopyDiagnostics={() => void copyDiagnostics().then((text) => navigator.clipboard?.writeText(text))}
        />
      </main>
    )
  }

  return <OverlayShell app={app} />
}

function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window
}

export default App
