import { ReleaseNotesFallback, ReleaseNotesMarkdown } from './ReleaseNotesMarkdown'

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
}) {
  if (variant === 'island') {
    return (
      <div className="island-update-rail" role="status">
        <strong className="island-update-rail__title">{title}</strong>
        <div className="island-update-rail__actions">
          <button type="button" className="island-update-rail__primary" onClick={onPrimary}>
            {primaryLabel}
          </button>
          <button type="button" className="island-update-rail__ghost" onClick={onLater}>
            {laterLabel}
          </button>
        </div>
      </div>
    )
  }

  const notes = releaseNotes?.trim() ?? ''

  return (
    <div className="update-banner update-banner--settings" role="status">
      <div className="update-banner__main">
        <strong className="update-banner__title">{title}</strong>
        {notes ? (
          <ReleaseNotesMarkdown
            markdown={notes}
            expandLabel={expandLabel ?? 'See all'}
            collapseLabel={collapseLabel ?? 'Collapse'}
            onOpenUrl={onOpenUrl}
          />
        ) : emptyNotesLabel ? (
          <ReleaseNotesFallback>{emptyNotesLabel}</ReleaseNotesFallback>
        ) : null}
        <div className="update-banner__actions">
          <button type="button" className="update-banner__primary" onClick={onPrimary}>
            {primaryLabel}
          </button>
          <button type="button" className="update-banner__ghost" onClick={onLater}>
            {laterLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
