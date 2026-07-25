import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, X } from 'lucide-react'
import { copyDiagnostics } from './app/tauriApi'
import { useIslandApp } from './app/useIslandApp'
import { OverlayShell } from './features/overlay/OverlayShell'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { IconButton } from './shared/ui/IconButton'
import './App.css'

function App() {
  const windowLabel = isTauriRuntime() ? getCurrentWindow().label : 'main'
  const app = useIslandApp({ mediaEnabled: windowLabel !== 'settings' })

  if (windowLabel === 'settings') {
    if (!app.config) {
      return <main className="settings-window-root">Loading settings...</main>
    }

    return (
      <main className="settings-window-root">
        <header className="settings-titlebar" data-tauri-drag-region>
          <strong className="settings-titlebar-drag">Music Island</strong>
          <div className="settings-window-actions" data-tauri-drag-region="false">
            <IconButton data-tauri-drag-region="false" aria-label="Свернуть" onClick={() => void runWindowAction('minimize')}><Minus /></IconButton>
            <IconButton data-tauri-drag-region="false" aria-label="Закрыть" onClick={() => void runWindowAction('hide')}><X /></IconButton>
          </div>
        </header>
        <div className="settings-scroll">
          <SettingsPanel
            config={app.config}
            smtcHealth={app.smtcHealth}
            mediaSessions={app.mediaSessions}
            onChange={app.updateConfig}
            onCopyDiagnostics={() => void copyDiagnostics().then((text) => navigator.clipboard?.writeText(text))}
            onRefreshSources={app.refreshMediaSessions}
            autostartError={app.autostartError ?? null}
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

async function runWindowAction(action: 'minimize' | 'hide'): Promise<void> {
  try {
    await getCurrentWindow()[action]()
  } catch (error) {
    console.error(`Settings window ${action} failed`, error)
  }
}

export default App
