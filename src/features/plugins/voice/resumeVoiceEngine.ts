import { loadSession } from './session'
import { voicePluginApi } from './pluginApi'

/**
 * If Better Voice was running when the app last quit, start it again.
 * Safe to call from the main window — does not depend on the settings UI.
 */
export async function resumeVoiceEngineIfNeeded(): Promise<void> {
  const saved = loadSession()
  let shouldResume = Boolean(saved?.engineRunning)
  try {
    const settings = await voicePluginApi.getSettings()
    shouldResume = shouldResume || Boolean(settings.autostart)
  } catch {
    /* ignore — fall back to session flag only */
  }
  if (!shouldResume) return

  try {
    const status = await voicePluginApi.getStatus()
    if (status.running) return

    await voicePluginApi.startDenoising(
      saved?.inputDevice || undefined,
      saved?.outputDevice || undefined,
      saved?.model || undefined,
      saved?.monitorEnabled,
    )
    if (saved) {
      await voicePluginApi.updateDenoiseConfig({
        enabled: saved.enabled,
        strength: saved.strength / 100,
        micGain: saved.micGain,
        agcEnabled: saved.agcEnabled,
        agcTarget: saved.agcTarget,
      })
      await voicePluginApi.updateEqConfig({
        enabled: saved.eqEnabled,
        bands: saved.eqBands,
      })
      await voicePluginApi.setMonitorMode(saved.monitorEnabled)
      await voicePluginApi.setMonitorPoint(saved.monitorPoint)
    }
  } catch (error) {
    console.warn('Better Voice auto-resume failed', error)
  }
}
