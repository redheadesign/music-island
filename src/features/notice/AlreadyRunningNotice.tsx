import { getCurrentWindow } from '@tauri-apps/api/window'
import { useMemo } from 'react'
import { createTranslator, normalizeLocale } from '../../shared/i18n/messages'
import type { Locale } from '../../shared/lib/types'
import { GlassSurface } from '../../shared/ui/GlassSurface'

interface AlreadyRunningNoticeProps {
  locale?: Locale | string | null
}

export function AlreadyRunningNotice({ locale }: AlreadyRunningNoticeProps) {
  const t = useMemo(() => createTranslator(normalizeLocale(locale)), [locale])

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
