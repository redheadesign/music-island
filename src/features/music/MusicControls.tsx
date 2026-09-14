import { Heart, HeartCrack, Pause, Play, Repeat, Repeat1, Shuffle } from 'lucide-react'
import type { Locale, RepeatMode } from '../../shared/lib/types'

export function PreviousFilledIcon({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6 5a1 1 0 0 1 1 1v4.22l8.48-5.09A1 1 0 0 1 17 6v12a1 1 0 0 1-1.52.86L7 13.78V18a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Z" /></svg>
}
export function NextFilledIcon({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18 5a1 1 0 0 0-1 1v4.22L8.52 5.13A1 1 0 0 0 7 6v12a1 1 0 0 0 1.52.86L17 13.78V18a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1Z" /></svg>
}
export function NavigationButton({ direction, disabled, onClick }: { direction: 'previous' | 'next'; disabled?: boolean; onClick?: () => void }) {
  return <button type="button" className="icon-button media-button" aria-label={direction === 'previous' ? 'Previous' : 'Next'} onClick={onClick} disabled={disabled}>{direction === 'previous' ? <PreviousFilledIcon /> : <NextFilledIcon />}</button>
}
export function PlaybackButton({ playing = true, artwork = false, disabled, onClick }: { playing?: boolean; artwork?: boolean; disabled?: boolean; onClick?: () => void }) {
  return <button type="button" className={`icon-button play-button${artwork ? ' artwork-play-button' : ''}`} aria-label={playing ? 'Pause' : 'Play'} onClick={onClick} disabled={disabled}>{playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
}
export function MediaArtwork({ src, title = '', playing = true, disabled, onClick }: { src?: string | null; title?: string; playing?: boolean; disabled?: boolean; onClick?: () => void }) {
  return <div className="artwork-shell">{src ? <img src={src} alt="" draggable={false} /> : <div className="artwork-placeholder">{title.slice(0, 2).toUpperCase()}</div>}<PlaybackButton artwork playing={playing} disabled={disabled} onClick={onClick} /></div>
}
export function ReactionButton({ kind, active = false, disabled, onClick }: { kind: 'like' | 'dislike'; active?: boolean; disabled?: boolean; onClick?: () => void }) {
  return <button type="button" className={`reaction-button${kind === 'like' ? ' reaction-button--like' : ''}${active ? ' reaction-button--active' : ''}`} aria-label={kind === 'like' ? active ? 'Убрать из любимого' : 'Добавить в любимое' : active ? 'Убрать дизлайк' : 'Не нравится'} aria-pressed={active} disabled={disabled} onClick={onClick}>{kind === 'like' ? <Heart fill={active ? 'currentColor' : 'none'} /> : <HeartCrack fill={active ? 'currentColor' : 'none'} />}</button>
}

export function PlaybackModeButton({ kind, active = false, repeatMode = 'off', disabled, onClick, locale = 'ru' }: { kind: 'shuffle' | 'repeat'; active?: boolean; repeatMode?: RepeatMode; disabled?: boolean; onClick?: () => void; locale?: Locale }) {
  const ru = locale === 'ru'
  const pressed = kind === 'shuffle' ? active : repeatMode !== 'off'
  const label = kind === 'shuffle' ? ru ? 'Перемешать' : 'Shuffle' : repeatMode === 'one' ? ru ? 'Повтор трека' : 'Repeat track' : ru ? 'Повтор' : 'Repeat'
  return <button type="button" className={`reaction-button playback-mode-button${pressed ? ' reaction-button--active' : ''}`} aria-label={label} title={disabled ? ru ? 'Недоступно в этом плеере' : 'Unavailable in this player' : label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>{kind === 'shuffle' ? <Shuffle /> : repeatMode === 'one' ? <Repeat1 /> : <Repeat />}{pressed ? <span className="playback-mode-button__dot" aria-hidden="true" /> : null}</button>
}
