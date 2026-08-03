import { ReleaseNotesFallback, ReleaseNotesMarkdown } from './ReleaseNotesMarkdown'

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
  const percent = progressPercent ?? (status === 'installing' ? 100 : 0)

  if (variant === 'island') {
    return (
      <div className="island-update-rail" role="status">
        <div className="island-update-rail__copy">
          <strong className="island-update-rail__title">
            {busy && progressLabel ? progressLabel : title}
          </strong>
          {status === 'error' && error ? (
            <span className="island-update-rail__error">{error}</span>
          ) : null}
          {busy ? (
            <div
              className="island-update-rail__progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className="island-update-rail__progress-track">
                <div
                  className="island-update-rail__progress-fill"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="island-update-rail__progress-meta">
                {percent > 0 ? `${percent}%` : '…'}
              </span>
            </div>
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
    <div className="update-banner update-banner--settings" role="status">
      <div className="update-banner__main">
        <strong className="update-banner__title">
          {busy && progressLabel ? progressLabel : title}
        </strong>
        {!busy && notes ? (
          <ReleaseNotesMarkdown
            markdown={notes}
            expandLabel={expandLabel ?? 'See all'}
            collapseLabel={collapseLabel ?? 'Collapse'}
            onOpenUrl={onOpenUrl}
          />
        ) : !busy && emptyNotesLabel ? (
          <ReleaseNotesFallback>{emptyNotesLabel}</ReleaseNotesFallback>
        ) : null}
        {busy ? (
          <div
            className="update-banner__progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className="update-banner__progress-track">
              <div
                className="update-banner__progress-fill"
                style={{ width: `${percent}%` }}
              />
            </div>
            <small>
              {progressLabel ?? ''}
              {progressPercent != null ? ` · ${progressPercent}%` : ''}
            </small>
          </div>
        ) : null}
        {status === 'error' && error ? (
          <p className="update-banner__error">{error}</p>
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
