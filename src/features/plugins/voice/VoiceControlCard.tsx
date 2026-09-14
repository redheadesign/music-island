import { Headphones, LoaderCircle, Mic2, Square } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import type { Locale } from '../../../shared/lib/types'
import { VoiceEffects } from './VoiceEffects'
import { VoiceAtmosphere } from './VoiceAtmosphere'
import { VoiceFoxMascot, type FoxClipId } from './VoiceFoxMascot'
import { messages } from './voiceMessages'
import './VoiceControlCard.css'

export interface VoiceControlCardProps {
  locale: Locale
  running: boolean
  busy?: boolean
  hydrated?: boolean
  active?: boolean
  reducedMotion?: boolean
  monitorEnabled: boolean
  activeEffect: number | null
  error?: string | null
  previewClipId?: FoxClipId | null
  onToggleProcessing: () => void
  onToggleMonitor: () => void
  onToggleEffect: (effect: number) => void
  children?: ReactNode
}

/** One control surface, shared by Settings and the component workshop. */
export function VoiceControlCard({
  locale, running, busy = false, hydrated = true, active = true, reducedMotion = false,
  monitorEnabled, activeEffect, error, previewClipId,
  onToggleProcessing, onToggleMonitor, onToggleEffect, children,
}: VoiceControlCardProps) {
  const t = messages[locale]
  const titleId = useId()
  return (
    <section className="voice-control-card" aria-labelledby={titleId} aria-busy={busy || !hydrated}>
      <VoiceAtmosphere running={running} active={active} reducedMotion={reducedMotion} />
      <VoiceFoxMascot size="settings" className="voice-control-card__fox"
        live={running} active={active} previewClipId={previewClipId} />
      <div className="voice-control-card__controls">
        <div className="voice-control-card__heading">
          <h2 id={titleId}>{t.controlTitle}</h2>
          <span className={`voice-control-card__status ${running ? 'is-live' : ''}`} role="status">
            <span className="voice-control-card__sr-only">{running ? t.running : t.stopped}</span>
          </span>
        </div>
        <div className="voice-control-card__actions">
          <button type="button" className="voice-control-card__primary"
            aria-label={running ? t.stop : t.start}
            disabled={busy || !hydrated} onClick={onToggleProcessing}>
            {busy || !hydrated ? <LoaderCircle className="voice-control-card__spinner" size={16} aria-hidden />
              : running ? <Square size={14} fill="currentColor" strokeWidth={0} aria-hidden /> : <Mic2 size={16} aria-hidden />}
            <span>{running ? t.stop : t.startShort}</span>
          </button>
          <button type="button" className="voice-control-card__monitor"
            aria-label={t.monitor} title={t.monitor} aria-pressed={monitorEnabled}
            disabled={busy || !hydrated} onClick={onToggleMonitor}>
            <Headphones size={18} aria-hidden />
            <span className="voice-control-card__monitor-dot" aria-hidden />
          </button>
        </div>
        <VoiceEffects locale={locale} label={t.extras}
          disabled={!running || busy || !hydrated} activeEffect={activeEffect} onToggle={onToggleEffect} />
      </div>
      {error ? <p className="voice-control-card__error" role="alert">{error.replace(/^Error:\s*/, '')}</p> : null}
      {children ? <div className="voice-control-card__developer">{children}</div> : null}
    </section>
  )
}
