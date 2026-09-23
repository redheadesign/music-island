import { Button } from '../../shared/ui/SettingsControls'
import { FlaskConical, LoaderCircle, Monitor, Music2 } from '../../shared/ui/SettingsIcons'
import { useId } from 'react'
import type { Ref } from 'react'
import type { Locale } from '../../shared/lib/types'
import { createTranslator } from '../../shared/i18n/messages'
import './DirectConnectionDialog.css'

interface DirectConnectionDialogProps {
  ref?: Ref<HTMLElement>
  locale?: Locale
  busy?: boolean
  reducedMotion?: boolean
  error?: string | null
  onCancel: () => void
  onConnect: () => void
}

/** Presentation only. SettingsPanel owns consent, focus and native connection. */
export function DirectConnectionDialog({
  ref,
  locale = 'ru',
  busy = false,
  reducedMotion = false,
  error = null,
  onCancel,
  onConnect,
}: DirectConnectionDialogProps) {
  const t = createTranslator(locale)
  const titleId = useId()
  const descriptionId = useId()

  return (
    <section
      ref={ref}
      className="direct-connection-dialog"
      data-reduced-motion={reducedMotion || undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="direct-connection-dialog__body">
        <header className="direct-connection-dialog__header">
          <span className="direct-connection-dialog__icon" aria-hidden="true"><Music2 size={22} /></span>
          <h2 id={titleId}>{t('consent.title')}</h2>
        </header>
        <p className="direct-connection-dialog__description" id={descriptionId}>
          {t('consent.body')}
          <strong>{t('consent.restart')}</strong>
        </p>
        <ul className="direct-connection-dialog__facts">
          <li><Monitor size={17} aria-hidden="true" /><span>{t('consent.li1')}</span></li>
          <li><FlaskConical size={17} aria-hidden="true" /><span>{t('consent.li2')}</span></li>
        </ul>
        {error && !busy ? (
          <div className="direct-connection-dialog__error" role="alert">
            <strong>{t('consent.errorTitle')}</strong>
            <p>{error}</p>
          </div>
        ) : null}
      </div>
      <footer className="direct-connection-dialog__footer">
        <p>{t('consent.li3')}</p>
        <div className="direct-connection-dialog__actions">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {busy ? t('consent.close') : t('consent.cancel')}
          </Button>
          <Button type="button" variant="primary" disabled={busy} onClick={onConnect}>
            {busy ? <LoaderCircle className="direct-connection-dialog__spinner" size={16} aria-hidden="true" /> : null}
            <span role={busy ? 'status' : undefined}>{busy ? t('consent.connecting') : error ? t('consent.retry') : t('consent.connect')}</span>
          </Button>
        </div>
      </footer>
    </section>
  )
}
