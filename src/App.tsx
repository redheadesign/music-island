import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { copyDiagnostics } from './app/tauriApi'
import { useIslandApp } from './app/useIslandApp'
import { OverlayShell } from './features/overlay/OverlayShell'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { createTranslator, normalizeLocale } from './shared/i18n/messages'
import { IconButton } from './shared/ui/IconButton'
import './App.css'

function App() {
  const windowLabel = isTauriRuntime() ? getCurrentWindow().label : 'main'
  const app = useIslandApp({ mediaEnabled: windowLabel !== 'settings' })
  const locale = normalizeLocale(app.config?.appearance.locale)
  const t = useMemo(() => createTranslator(locale), [locale])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  if (windowLabel === 'settings') {
    if (!app.config) {
      return <main className="settings-window-root">{t('settings.loading')}</main>
    }

    return (
      <main className="settings-window-root">
        <header className="settings-titlebar" data-tauri-drag-region>
          <strong className="settings-titlebar-drag">Music Island</strong>
          <div className="settings-window-actions" data-tauri-drag-region="false">
            <IconButton data-tauri-drag-region="false" aria-label={t('settings.minimize')} onClick={() => void runWindowAction('minimize')}><Minus /></IconButton>
            <IconButton data-tauri-drag-region="false" aria-label={t('settings.close')} onClick={() => void runWindowAction('hide')}><X /></IconButton>
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
            autostartStatus={app.autostartStatus ?? null}
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
