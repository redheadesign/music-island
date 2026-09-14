import { useId, useMemo, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const PREVIEW_BLOCKS = 3

function splitPreview(markdown: string): { preview: string; rest: string; truncated: boolean } {
  const normalized = markdown.replace(/\r\n/g, '\n').trim()
  if (!normalized) return { preview: '', rest: '', truncated: false }

  const blocks = normalized.split(/\n{2,}/)
  if (blocks.length <= PREVIEW_BLOCKS) {
    return { preview: normalized, rest: '', truncated: false }
  }

  // Keep a section heading with its body instead of leaving it above the toggle.
  const isHeading = (block: string) => /^(?: {0,3}#{1,6}(?:[ \t]+[^\n]*)?(?:\n|$))+$/.test(block)
    || /^[^\n]+\n {0,3}(?:=+|-+)[ \t]*$/.test(block)
  let previewEnd = PREVIEW_BLOCKS
  while (previewEnd > 0 && isHeading(blocks[previewEnd - 1])) previewEnd -= 1
  if (previewEnd === 0) {
    // If the opening is only headings, include their first body block.
    previewEnd = PREVIEW_BLOCKS
    while (previewEnd < blocks.length && isHeading(blocks[previewEnd - 1])) previewEnd += 1
  }

  const preview = blocks.slice(0, previewEnd).join('\n\n')
  const rest = blocks.slice(previewEnd).join('\n\n')
  return { preview, rest, truncated: Boolean(rest) }
}

function MarkdownBody({
  source,
  onOpenUrl,
}: {
  source: string
  onOpenUrl?: (url: string) => void
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => (
          <button
            type="button"
            className="release-notes-md__link"
            onClick={() => {
              if (!href) return
              if (onOpenUrl) {
                onOpenUrl(href)
                return
              }
              window.open(href, '_blank', 'noopener,noreferrer')
            }}
          >
            {children}
          </button>
        ),
      }}
    >
      {source}
    </ReactMarkdown>
  )
}

export function ReleaseNotesMarkdown({
  markdown,
  expandLabel,
  collapseLabel,
  onOpenUrl,
}: {
  markdown: string
  expandLabel: string
  collapseLabel: string
  onOpenUrl?: (url: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const bodyId = useId()
  const { preview, rest, truncated } = useMemo(() => splitPreview(markdown), [markdown])

  if (!preview) return null

  return (
    <div className="release-notes-md">
      <div className="release-notes-md__body" id={bodyId}>
        <MarkdownBody
          source={expanded || !truncated ? `${preview}${rest ? `\n\n${rest}` : ''}` : preview}
          onOpenUrl={onOpenUrl}
        />
      </div>
      {truncated ? (
        <button
          type="button"
          className="release-notes-md__toggle"
          aria-controls={bodyId}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? collapseLabel : expandLabel}
        </button>
      ) : null}
    </div>
  )
}

export function ReleaseNotesFallback({ children }: { children: ReactNode }) {
  return <p className="release-notes-md__fallback">{children}</p>
}
