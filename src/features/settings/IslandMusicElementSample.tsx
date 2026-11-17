import type { CSSProperties } from 'react'
import { Mic, Pin } from 'lucide-react'
import type { IslandLayoutElement } from '../../shared/lib/islandLayout'
import { MediaArtwork, NavigationButton, PlaybackButton, ReactionButton, PlaybackModeButton } from '../music/MusicControls'
import { SeekStepButton } from '../music/SeekStepButton'
import { ProgressStrip } from '../music/ProgressStrip'
import { APPEARANCE_PREVIEW_MEDIA as media } from './previewMedia'

/** Production catalog samples without the optional quota/scene dependencies. */
export function IslandMusicElementSample({ element, locale = 'ru' }: {
  element: Exclude<IslandLayoutElement, 'codex' | 'claude'>; locale?: 'ru' | 'en'
}) {
  if (element === 'previous' || element === 'next') return <NavigationButton locale={locale} direction={element} />
  if (element === 'seekBack' || element === 'seekForward') return <SeekStepButton locale={locale} direction={element} />
  if (element === 'artwork') return <MediaArtwork locale={locale} src={media.thumbnailDataUrl} />
  if (element === 'transport') return <PlaybackButton locale={locale} />
  if (element === 'like' || element === 'dislike') return <ReactionButton locale={locale} kind={element} />
  if (element === 'shuffle' || element === 'repeat') return <PlaybackModeButton kind={element} locale={locale} />
  if (element === 'progress') return <button type="button" className="progress-track" aria-label={locale === 'ru' ? 'Позиция трека' : 'Seek track'} style={{ '--progress': .34, width: 210 } as CSSProperties}><ProgressStrip frame={{ trackKey: 'catalog', ratio: .34, positionMs: media.positionMs, durationMs: media.durationMs, label: 'Music Island · Evening Light' }} navigation={null} reducedMotion scrubbing={false} /></button>
  return <button type="button" className="icon-button" aria-label={element}>{element === 'microphone' ? <Mic size={16} /> : <Pin size={16} />}</button>
}
