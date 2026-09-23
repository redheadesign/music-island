import { ArrowLeft, ArrowUpRight, ChevronDown } from '../../../shared/ui/SettingsIcons'
import type { Locale } from '../../../shared/lib/types'
import { getVoiceGuide } from './guide/voiceGuideContent'
import './VoiceGuidePage.css'

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

  return (
    <div className="voice-guide-page voice-setup-guide">
      <button type="button" className="voice-setup-guide__back" onClick={onBack}>
        <ArrowLeft size={16} aria-hidden />
        {doc.back}
      </button>

      <article className="voice-setup-guide__article">
        <header className="voice-setup-guide__intro">
          <h1>{doc.title}</h1>
          <p>{doc.lead}</p>
          <p className="voice-setup-guide__local">{doc.localNote}</p>
        </header>

        <ol className="voice-setup-guide__steps" aria-label={doc.stepsLabel}>
          {doc.steps.map((step, index) => (
            <li key={step.id} className="voice-setup-guide__step">
              <span className="voice-setup-guide__number" aria-hidden>{index + 1}</span>
              <div className="voice-setup-guide__step-body">
                <h2>{step.title}</h2>
                <p>{step.text}</p>
                {step.device ? (
                  <dl className="voice-setup-guide__device">
                    <dt>{step.device.label}</dt>
                    <dd>{step.device.value}</dd>
                  </dl>
                ) : null}
                {step.action === 'download' ? (
                  <button type="button" className="voice-setup-guide__action" onClick={onOpenCableSite}>
                    {openCableSiteLabel}
                    <ArrowUpRight size={15} aria-hidden />
                  </button>
                ) : null}
                {step.note ? <p className="voice-setup-guide__note">{step.note}</p> : null}
              </div>
            </li>
          ))}
        </ol>

        <button type="button" className="voice-setup-guide__return" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden />
          {doc.returnToSettings}
        </button>

        <section className="voice-setup-guide__help">
          <h2>{doc.helpTitle}</h2>
          {doc.help.map((item) => (
            <details key={item.title} className="voice-setup-guide__disclosure">
              <summary>
                {item.title}
                <ChevronDown size={16} aria-hidden />
              </summary>
              <p>{item.text}</p>
            </details>
          ))}
        </section>
      </article>
    </div>
  )
}
