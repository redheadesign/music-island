import { useMemo, useState, type ReactNode } from 'react'
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

  const preview = blocks.slice(0, PREVIEW_BLOCKS).join('\n\n')
  const rest = blocks.slice(PREVIEW_BLOCKS).join('\n\n')
  return { preview, rest, truncated: true }
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
  const { preview, rest, truncated } = useMemo(() => splitPreview(markdown), [markdown])

  if (!preview) return null

  return (
    <div className="release-notes-md">
      <div className="release-notes-md__body">
        <MarkdownBody
          source={expanded || !truncated ? `${preview}${rest ? `\n\n${rest}` : ''}` : preview}
          onOpenUrl={onOpenUrl}
        />
      </div>
      {truncated ? (
        <button
          type="button"
          className="release-notes-md__toggle"
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
