import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useMemo } from 'react'
import { checkForUpdates, copyDiagnostics } from './app/tauriApi'
import { useIslandApp } from './app/useIslandApp'
import { useUsageController } from './app/usage/useUsageController'
import { LaunchExperience } from './features/intro/LaunchExperience'
import { DictationOverlay } from './features/dictation/DictationOverlay'
import { resumeVoiceEngineIfNeeded } from './features/plugins/voice/resumeVoiceEngine'
import { AlreadyRunningNotice } from './features/notice/AlreadyRunningNotice'
import { OverlayShell } from './features/overlay/OverlayShell'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { TaskbarPlayer } from './features/taskbar/TaskbarPlayer'
import { createTranslator, normalizeLocale } from './shared/i18n/messages'
import { SettingsReadError, SettingsWindow } from './features/settings/SettingsWindow'
import { useGlassPointerLight } from './shared/ui/useGlassPointerLight'
import './App.css'

function App() {
  const windowLabel = isTauriRuntime() ? getCurrentWindow().label : 'main'
  useGlassPointerLight(windowLabel === 'settings' || windowLabel === 'intro' || windowLabel === 'main')

  // Intro is a separate Tauri window — keep it free of island hooks/state.
  if (windowLabel === 'intro') {
    return <LaunchExperience />
  }
  if (windowLabel === 'recording_overlay') return <DictationOverlay />

  return <IslandWindows windowLabel={windowLabel} />
}

function IslandWindows({ windowLabel }: { windowLabel: string }) {
  const mediaEnabled = windowLabel === 'main' || windowLabel === 'taskbar'
  const app = useIslandApp({ mediaEnabled, includeConfigPreviews: windowLabel !== 'settings', timelineEnabled: windowLabel !== 'taskbar', windowEventsEnabled: windowLabel === 'main' })
  const usage = useUsageController(windowLabel === 'main' || windowLabel === 'settings')
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
    return <AlreadyRunningNotice config={app.config} />
  }

  if (windowLabel === 'taskbar') {
    return <TaskbarPlayer snapshot={app.media} locale={locale}
      reducedMotion={app.config.appearance.reducedMotion}
      unavailable={app.config.media.protocol === 'yandex-direct' && app.directNeedsRecovery}
      onCommand={(command) => void app.sendCommand(command)}
      scale={app.config.taskbar?.scale} showLike={app.config.taskbar?.showLike} />
  }

  if (windowLabel === 'settings') {
    return (
      <SettingsWindow
        locale={locale}
        reducedMotion={app.config.appearance.reducedMotion}
        onMinimize={() => void runWindowAction('minimize')}
        onClose={() => void runWindowAction('hide')}
      >
        {!app.configLoaded ? <p role="status">{t('settings.loading')}</p> : app.configLoadFailed ? (
          <SettingsReadError locale={locale} onRetry={app.retryConfigLoad} />
        ) : <SettingsPanel
            usage={usage}
            config={app.config}
            smtcHealth={app.smtcHealth}
            mediaSessions={app.mediaSessions}
            onChange={app.updateConfig}
            onCopyDiagnostics={() => void copyDiagnostics().then((text) => navigator.clipboard?.writeText(text))}
            onRefreshSources={app.refreshMediaSessions}
            autostartError={app.autostartError ?? null}
            autostartStatus={app.autostartStatus ?? null}
          />}
      </SettingsWindow>
    )
  }

  return <OverlayShell app={app} usage={usage} />
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
