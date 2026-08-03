import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { checkForUpdates, copyDiagnostics } from './app/tauriApi'
import { useIslandApp } from './app/useIslandApp'
import { IntroSplash } from './features/intro/IntroSplash'
import { resumeVoiceEngineIfNeeded } from './features/plugins/voice/resumeVoiceEngine'
import { AlreadyRunningNotice } from './features/notice/AlreadyRunningNotice'
import { OverlayShell } from './features/overlay/OverlayShell'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { createTranslator, normalizeLocale } from './shared/i18n/messages'
import { IconButton } from './shared/ui/IconButton'
import './App.css'

function App() {
  const windowLabel = isTauriRuntime() ? getCurrentWindow().label : 'main'

  // Intro is a separate Tauri window — keep it free of island hooks/state.
  if (windowLabel === 'intro') {
    return <IntroSplash />
  }

  return <IslandWindows windowLabel={windowLabel} />
}

function IslandWindows({ windowLabel }: { windowLabel: string }) {
  const mediaEnabled = windowLabel === 'main'
  const app = useIslandApp({ mediaEnabled })
  const locale = normalizeLocale(app.config?.appearance.locale)
  const t = useMemo(() => createTranslator(locale), [locale])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    if (windowLabel !== 'main' || !isTauriRuntime()) return
    void checkForUpdates().catch((error) => {
      console.warn('Startup update check failed', error)
    })
    void resumeVoiceEngineIfNeeded()
  }, [windowLabel])

  if (windowLabel === 'already-running') {
    return <AlreadyRunningNotice locale={locale} />
  }

  if (windowLabel === 'settings') {
    if (!app.config) {
      return <main className="settings-window-root">{t('settings.loading')}</main>
    }

    return (
      <main className="settings-window-root">
        <header className="settings-titlebar" data-tauri-drag-region>
          <strong className="settings-titlebar-drag">{t('settings.title')}</strong>
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
