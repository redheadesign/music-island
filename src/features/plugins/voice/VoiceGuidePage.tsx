import { ArrowLeft } from 'lucide-react'
import type { Locale } from '../../../shared/lib/types'
import { getVoiceGuide, type GuideBlock } from './guide/voiceGuideContent'

export function VoiceGuidePage({
  locale,
  onBack,
  openCableSiteLabel,
  onOpenCableSite,
}: {
  locale: Locale
  onBack: () => void
  openCableSiteLabel: string
  onOpenCableSite: () => void
}) {
  const doc = getVoiceGuide(locale)
  const backLabel = locale === 'ru' ? 'Назад' : 'Back'

  return (
    <div className="voice-guide-page">
      <header className="voice-guide-page__top">
        <button type="button" className="voice-guide-page__back" onClick={onBack}>
          <ArrowLeft size={18} aria-hidden />
          <span>{backLabel}</span>
        </button>
      </header>

      <article className="voice-guide-article">
        <h1 className="voice-guide-article__title">{doc.title}</h1>
        <p className="voice-guide-article__lead">{doc.lead}</p>

        <nav className="voice-guide-toc" aria-label={locale === 'ru' ? 'Содержание' : 'Contents'}>
          {doc.sections.map((section) => (
            <a key={section.id} href={`#guide-${section.id}`} className="voice-guide-toc__link">
              {section.title}
            </a>
          ))}
        </nav>

        {doc.sections.map((section) => (
          <section key={section.id} id={`guide-${section.id}`} className="voice-guide-section">
            <h2 className="voice-guide-section__title">{section.title}</h2>
            {section.blocks.map((block, index) => (
              <GuideBlockView key={`${section.id}-${index}`} block={block} />
            ))}
          </section>
        ))}

        <div className="voice-guide-article__actions">
          <button type="button" className="secondary-button" onClick={onOpenCableSite}>
            {openCableSiteLabel}
          </button>
        </div>
      </article>
    </div>
  )
}

function GuideBlockView({ block }: { block: GuideBlock }) {
  switch (block.type) {
    case 'p':
      return <p className="voice-guide-p">{block.text}</p>
    case 'h2':
      return <h2 className="voice-guide-section__title">{block.text}</h2>
    case 'h3':
      return <h3 className="voice-guide-h3">{block.text}</h3>
    case 'ul':
      return (
        <ul className="voice-guide-list">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol className="voice-guide-list voice-guide-list--ordered">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      )
    case 'callout':
      return <aside className="voice-guide-callout">{block.text}</aside>
    default:
      return null
  }
}
