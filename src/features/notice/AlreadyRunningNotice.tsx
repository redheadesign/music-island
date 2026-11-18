import { useSystemReducedTransparency } from '../../shared/ui/useSystemReducedTransparency'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { getInstallHandoff, openNewerInstall, type InstallHandoff } from '../../app/tauriApi'
import { createTranslator, normalizeLocale } from '../../shared/i18n/messages'
import type { AppConfig } from '../../shared/lib/types'
import { getInterfacePaletteStyle, getInterfaceTheme, getSettingsColorScheme } from '../../shared/lib/uiPrefs'
import { Button, Notice } from '../../shared/ui/SettingsControls'

export function AlreadyRunningNotice({ config }: { config: AppConfig }) {
  const reducedTransparency = useSystemReducedTransparency()
  const t = createTranslator(normalizeLocale(config.appearance.locale))
  const [handoff, setHandoff] = useState<InstallHandoff | null>(null)
  const [busy, setBusy] = useState(true)
  const [failure, setFailure] = useState<'read' | 'open' | 'close' | null>(null)
  const [attempt, setAttempt] = useState(0)
  const reload = useCallback(() => { setBusy(true); setFailure(null); setAttempt(value => value + 1) }, [])
  useEffect(() => {
    let active = true
    void getInstallHandoff().then(value => { if (active) setHandoff(value) })
      .catch(() => { if (active) setFailure('read') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [attempt])
  const run = async (action: 'open' | 'close') => {
    if (busy) return
    setBusy(true)
    setFailure(null)
    try {
      if (action === 'open') await openNewerInstall()
      else await getCurrentWindow().hide()
    } catch {
      setFailure(action)
    } finally { setBusy(false) }
  }
  const scheme = getSettingsColorScheme(config)
  return <main className="notice-window-root auxiliary-ui" data-color-scheme={scheme} data-interface-theme={getInterfaceTheme(config)}
    data-reduced-motion={config.appearance.reducedMotion || undefined} data-reduced-transparency={reducedTransparency || undefined}
    style={getInterfacePaletteStyle(config, scheme) as CSSProperties}>
    <section className="notice-card" aria-busy={busy}>
      {busy && !handoff && !failure ? <span role="status">{t('settings.loading')}</span> : <>
        <h1>{t(handoff ? 'notice.newerTitle' : 'notice.alreadyRunningTitle')}</h1>
        {handoff ? <><p>{t('notice.newerBody').replace('{version}', handoff.version)}</p><p className="notice-hint" title={handoff.path}>{handoff.path}</p></> :
          !failure && <p>{t('notice.alreadyRunningHint')}</p>}
        {failure && <Notice compact tone="danger">{t(failure === 'read' ? 'notice.readFailed' : failure === 'open' ? 'notice.openFailed' : 'notice.closeFailed')}</Notice>}
        <div className="notice-actions">
          {failure === 'read' && <Button onClick={reload}>{t('settings.retryRead')}</Button>}
          {handoff && <Button variant="primary" disabled={busy} onClick={() => void run('open')}>{t('notice.openNewer')}</Button>}
          <Button disabled={busy} onClick={() => void run('close')}>{t('notice.close')}</Button>
        </div>
      </>}
    </section>
  </main>
}
