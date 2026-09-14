import { ArrowDownToLine, PackageCheck, TriangleAlert } from 'lucide-react'
import { useId } from 'react'
import { ReleaseNotesFallback, ReleaseNotesMarkdown } from './ReleaseNotesMarkdown'
import './UpdateBanner.css'

export type UpdateBannerStatus = 'available' | 'downloading' | 'installing' | 'error'

export function UpdateBanner({
  variant,
  title,
  releaseNotes,
  emptyNotesLabel,
  expandLabel,
  collapseLabel,
  primaryLabel,
  laterLabel,
  onPrimary,
  onLater,
  onOpenUrl,
  status = 'available',
  progressPercent = null,
  progressLabel,
  error = null,
}: {
  variant: 'settings' | 'island'
  title: string
  releaseNotes?: string | null
  emptyNotesLabel?: string
  expandLabel?: string
  collapseLabel?: string
  primaryLabel: string
  laterLabel: string
  onPrimary: () => void
  onLater: () => void
  onOpenUrl?: (url: string) => void
  status?: UpdateBannerStatus
  progressPercent?: number | null
  progressLabel?: string
  error?: string | null
}) {
  const busy = status === 'downloading' || status === 'installing'
  const titleId = useId()
  const hasError = !busy && (status === 'error' || Boolean(error))
  const heading = busy && progressLabel ? progressLabel : title
  const percent = progressPercent != null && Number.isFinite(progressPercent)
    ? Math.min(100, Math.max(0, Math.round(progressPercent)))
    : undefined
  const state = hasError ? 'error' : status

  if (variant === 'island') {
    return (
      <div className="update-notice island-update-rail" data-status={state} role="region" aria-labelledby={titleId}>
        <div className="island-update-rail__copy">
          <strong className="island-update-rail__title" id={titleId} role="status">
            {heading}
          </strong>
          {hasError && error ? (
            <span className="island-update-rail__error" role="alert">{error}</span>
          ) : null}
          {busy ? (
            <UpdateProgress variant="island" percent={percent} label={heading} />
          ) : null}
        </div>
        {!busy ? (
          <div className="island-update-rail__actions">
            <button
              type="button"
              className="island-update-rail__primary"
              onClick={onPrimary}
            >
              {primaryLabel}
            </button>
            <button type="button" className="island-update-rail__ghost" onClick={onLater}>
              {laterLabel}
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  const notes = releaseNotes?.trim() ?? ''

  return (
    <div className="update-notice update-banner update-banner--settings" data-status={state} role="region" aria-labelledby={titleId}>
      <div className="update-banner__main">
        <div className="update-banner__heading">
          <span className="update-banner__icon" aria-hidden="true">
            {hasError ? <TriangleAlert size={18} /> : status === 'installing' ? <PackageCheck size={18} /> : <ArrowDownToLine size={18} />}
          </span>
          <strong className="update-banner__title" id={titleId} role="status">{heading}</strong>
        </div>
        {!busy && !hasError && notes ? (
          <ReleaseNotesMarkdown
            markdown={notes}
            expandLabel={expandLabel ?? 'See all'}
            collapseLabel={collapseLabel ?? 'Collapse'}
            onOpenUrl={onOpenUrl}
          />
        ) : !busy && !hasError && emptyNotesLabel ? (
          <ReleaseNotesFallback>{emptyNotesLabel}</ReleaseNotesFallback>
        ) : null}
        {busy ? (
          <UpdateProgress variant="settings" percent={percent} label={heading} />
        ) : null}
        {hasError && error ? (
          <p className="update-banner__error" role="alert">{error}</p>
        ) : null}
        {!busy ? (
          <div className="update-banner__actions">
            <button type="button" className="update-banner__primary" onClick={onPrimary}>
              {primaryLabel}
            </button>
            <button type="button" className="update-banner__ghost" onClick={onLater}>
              {laterLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function UpdateProgress({ variant, percent, label }: {
  variant: 'settings' | 'island'
  percent: number | undefined
  label: string
}) {
  const prefix = variant === 'island' ? 'island-update-rail' : 'update-banner'
  return (
    <div className={`${prefix}__progress`}>
      <div
        className={`${prefix}__progress-track`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        data-indeterminate={percent == null || undefined}
      >
        <div className={`${prefix}__progress-fill`} style={percent == null ? undefined : { width: `${percent}%` }} />
      </div>
      <span className={`${prefix}__progress-meta`} aria-hidden="true">
        {percent == null ? '…' : `${percent}%`}
      </span>
    </div>
  )
}
