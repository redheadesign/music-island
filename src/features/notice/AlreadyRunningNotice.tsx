import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useMemo, useState } from 'react'
import { getInstallHandoff, openNewerInstall, type InstallHandoff } from '../../app/tauriApi'
import { createTranslator, normalizeLocale } from '../../shared/i18n/messages'
import type { Locale } from '../../shared/lib/types'
import { GlassSurface } from '../../shared/ui/GlassSurface'

interface AlreadyRunningNoticeProps {
  locale?: Locale | string | null
}

export function AlreadyRunningNotice({ locale }: AlreadyRunningNoticeProps) {
  const t = useMemo(() => createTranslator(normalizeLocale(locale)), [locale])
  const [handoff, setHandoff] = useState<InstallHandoff | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getInstallHandoff().then(setHandoff).catch(() => setHandoff(null))
  }, [])

  if (handoff) {
    return (
      <main className="notice-window-root">
        <GlassSurface as="section" className="notice-card">
          <h1>{t('notice.newerTitle')}</h1>
          <p>{t('notice.newerBody').replace('{version}', handoff.version)}</p>
          <p className="notice-hint">{handoff.path}</p>
          <div className="notice-actions">
            <button
              type="button"
              className="notice-ok"
              disabled={busy}
              onClick={() => {
                setBusy(true)
                void openNewerInstall().catch((error) => {
                  console.error(error)
                  setBusy(false)
                })
              }}
            >
              {t('notice.openNewer')}
            </button>
            <button type="button" className="notice-secondary" onClick={() => void hideNotice()}>
              {t('notice.ok')}
            </button>
          </div>
        </GlassSurface>
      </main>
    )
  }

  return (
    <main className="notice-window-root">
      <GlassSurface as="section" className="notice-card">
        <h1>{t('notice.alreadyRunningTitle')}</h1>
        <p>{t('notice.alreadyRunningBody')}</p>
        <p className="notice-hint">{t('notice.alreadyRunningHint')}</p>
        <button type="button" className="notice-ok" onClick={() => void hideNotice()}>
          {t('notice.ok')}
        </button>
      </GlassSurface>
    </main>
  )
}

async function hideNotice(): Promise<void> {
  try {
    await getCurrentWindow().hide()
  } catch (error) {
    console.error('Already-running notice hide failed', error)
  }
}
