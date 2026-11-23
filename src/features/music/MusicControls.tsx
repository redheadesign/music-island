import { Repeat, Repeat1, Shuffle } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { useId, type CSSProperties } from 'react'
import { PressFeedback } from '../../shared/ui/PressFeedback'
import { createTranslator } from '../../shared/i18n/messages'
import type { Locale, RepeatMode } from '../../shared/lib/types'

export function PreviousFilledIcon({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6 5a1 1 0 0 1 1 1v4.22l8.48-5.09A1 1 0 0 1 17 6v12a1 1 0 0 1-1.52.86L7 13.78V18a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Z" /></svg>
}
export function NextFilledIcon({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18 5a1 1 0 0 0-1 1v4.22L8.52 5.13A1 1 0 0 0 7 6v12a1 1 0 0 0 1.52.86L17 13.78V18a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1Z" /></svg>
}
export function NavigationButton({ direction, disabled, onClick, locale = 'ru' }: { locale?: Locale; direction: 'previous' | 'next'; disabled?: boolean; onClick?: () => void }) {
  return <button type="button" className="icon-button media-button media-navigation-button" aria-label={createTranslator(locale)(direction === 'previous' ? 'music.previous' : 'music.next')} onClick={onClick} disabled={disabled}>{direction === 'previous' ? <PreviousFilledIcon /> : <NextFilledIcon />}</button>
}
export function PlaybackButton({ playing = true, artwork = false, disabled, onClick, reducedMotion = false, locale = 'ru' }: { locale?: Locale; playing?: boolean; artwork?: boolean; disabled?: boolean; onClick?: () => void; reducedMotion?: boolean }) {
  const glassFill = useId()
  const systemReduced = useReducedMotion()
  const transition = { duration: reducedMotion || systemReduced ? 0 : .3, ease: [0.2, 0, 0, 1] as const }
  return <PressFeedback direction={playing ? 'inward' : 'outward'} reducedMotion={reducedMotion} type="button" className={`icon-button play-button${artwork ? ' artwork-play-button' : ''}`} aria-label={createTranslator(locale)(playing ? 'music.pause' : 'music.play')} onClick={onClick} disabled={disabled}>
    <svg className="playback-morph" width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" aria-hidden="true"
      style={{ '--playback-glass-fill': `url("#${glassFill}")` } as CSSProperties}>
      <defs>
        <linearGradient id={glassFill} x1="0" y1="0" x2=".25" y2="1">
          <stop stopColor="currentColor" />
          <stop className="playback-morph__shade" offset="1" stopColor="currentColor" stopOpacity=".58" />
        </linearGradient>
      </defs>
      <motion.path initial={false} animate={{ d: playing ? 'M6 5 L10 5 L10 19 L6 19 Z' : 'M7 4 L12 7 L12 17 L7 20 Z' }} transition={transition} />
      <motion.path initial={false} animate={{ d: playing ? 'M14 5 L18 5 L18 19 L14 19 Z' : 'M12 7 L20 12 L20 12 L12 17 Z' }} transition={transition} />
    </svg>
  </PressFeedback>
}
export function MediaArtwork({ src, title = '', playing = true, disabled, onClick, reducedMotion = false, locale = 'ru' }: { locale?: Locale; src?: string | null; title?: string; reducedMotion?: boolean; playing?: boolean; disabled?: boolean; onClick?: () => void }) {
  return <div className="artwork-shell">{src ? <img src={src} alt="" draggable={false} /> : <div className="artwork-placeholder">{title.slice(0, 2).toUpperCase()}</div>}<PlaybackButton locale={locale} artwork reducedMotion={reducedMotion} playing={playing} disabled={disabled} onClick={onClick} /></div>
}
export { ReactionButton } from './ReactionButton'

export function PlaybackModeButton({ kind, active = false, repeatMode = 'off', disabled, onClick, locale = 'ru' }: { kind: 'shuffle' | 'repeat'; active?: boolean; repeatMode?: RepeatMode; disabled?: boolean; onClick?: () => void; locale?: Locale }) {
  const ru = locale === 'ru'
  const pressed = kind === 'shuffle' ? active : repeatMode !== 'off'
  const label = kind === 'shuffle' ? ru ? 'Перемешать' : 'Shuffle' : repeatMode === 'one' ? ru ? 'Повтор трека' : 'Repeat track' : ru ? 'Повтор' : 'Repeat'
  return <button type="button" className={`reaction-button playback-mode-button${pressed ? ' reaction-button--active' : ''}`} aria-label={label} title={disabled ? ru ? 'Недоступно в этом плеере' : 'Unavailable in this player' : label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>{kind === 'shuffle' ? <Shuffle /> : repeatMode === 'one' ? <Repeat1 /> : <Repeat />}{pressed ? <span className="playback-mode-button__dot" aria-hidden="true" /> : null}</button>
}
