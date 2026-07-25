import { Heart, HeartCrack, Pause, Play } from 'lucide-react'
import { useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import type { MediaCommand, MediaSnapshot } from '../../shared/lib/types'
import { formatTime } from '../../shared/lib/format'
import { MarqueeText } from '../../shared/ui/MarqueeText'

interface MusicModuleProps {
  media: MediaSnapshot | null
  progressMs: number | null
  progressPercent: number
  density: 'buttons-only' | 'minimal' | 'balanced' | 'rich'
  showArtwork: boolean
  showTitle: boolean
  showArtist: boolean
  showProgress: boolean
  showSource: boolean
  showPreviousNext: boolean
  onCommand: (command: MediaCommand) => void
  showDirectReload?: boolean
  directReloadBusy?: boolean
  onDirectReload?: () => void
}

export function MusicModule({
  media,
  progressMs,
  progressPercent,
  density,
  showArtwork,
  showTitle,
  showArtist,
  showProgress,
  showPreviousNext,
  onCommand,
  showDirectReload = false,
  directReloadBusy = false,
  onDirectReload,
}: MusicModuleProps) {
  const [scrubRatio, setScrubRatio] = useState<number | null>(null)
  const scrubbingRef = useRef(false)
  const seekGestureIdRef = useRef<number | null>(null)
  const seekSentRef = useRef(false)

  if (media?.provider === 'smtc' && media.smtcHealth === 'unavailable') {
    return (
      <section className="music-module music-module--empty music-module--warning" aria-label="SMTC unavailable">
        <div className="track-copy">
          <strong>SMTC недоступен</strong>
          <span>Windows media protocol завис. Перезагрузите Windows.</span>
        </div>
      </section>
    )
  }

  if (!media?.hasSession) {
    const isDirect = media?.provider === 'yandex-direct'
    return (
      <section className="music-module music-module--empty" aria-label="No media session">
        <div className="track-copy">
          <strong>{isDirect ? 'Direct переподключается' : 'No music playing'}</strong>
          <span>{isDirect ? 'Можно быстро перезагрузить протокол прямо здесь.' : 'Start any Windows media source.'}</span>
        </div>
        {isDirect && onDirectReload ? (
          <button
            type="button"
            className="direct-reload-button"
            disabled={directReloadBusy}
            onClick={() => onDirectReload()}
          >
            {directReloadBusy ? 'Перезагрузка…' : 'Быстрая перезагрузка'}
          </button>
        ) : null}
      </section>
    )
  }

  const isPlaying = media.playbackStatus === 'playing'
  const title = media.title || 'Unknown track'
  const isButtonsOnly = density === 'buttons-only'
  const canShowSeek = showProgress && !isButtonsOnly && Boolean(media.durationMs)
  const trackLabel = [
    showArtist ? media.artist : null,
    showTitle ? title : null,
  ].filter(Boolean).join(' · ') || title
  const activeRatio = scrubRatio ?? progressPercent / 100
  const activeProgressMs =
    scrubRatio != null && media.durationMs
      ? Math.round(media.durationMs * scrubRatio)
      : progressMs
  const recoveryBanner = showDirectReload && onDirectReload ? (
    <div className="direct-reload-banner">
      <span>Direct нужно перезагрузить</span>
      <button
        type="button"
        className="direct-reload-button"
        disabled={directReloadBusy}
        onClick={() => onDirectReload()}
      >
        {directReloadBusy ? 'Перезагрузка…' : 'Быстрая перезагрузка'}
      </button>
    </div>
  ) : null

  const ratioFromPointer = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
  }

  const finishSeekGesture = (event: PointerEvent<HTMLButtonElement>, commit: boolean) => {
    if (seekGestureIdRef.current !== event.pointerId) {
      return
    }

    if (commit && !seekSentRef.current && media.durationMs && media.canSeek) {
      seekSentRef.current = true
      const ratio = ratioFromPointer(event)
      onCommand({ seek: { positionMs: Math.round(media.durationMs * ratio) } })
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    scrubbingRef.current = false
    seekGestureIdRef.current = null
    setScrubRatio(null)
  }

  const handleSeekPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!media.durationMs || !media.canSeek) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    scrubbingRef.current = true
    seekSentRef.current = false
    seekGestureIdRef.current = event.pointerId
    setScrubRatio(ratioFromPointer(event))
  }

  const handleSeekPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!scrubbingRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }

    setScrubRatio(ratioFromPointer(event))
  }

  const handleSeekPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    finishSeekGesture(event, true)
  }

  const handleSeekPointerCancel = (event: PointerEvent<HTMLButtonElement>) => {
    finishSeekGesture(event, false)
  }

  return (
    <section className={`music-module music-module--${density}`} aria-label="Now playing">
      {recoveryBanner}
      <div className="media-controls media-controls--island" aria-label="Playback controls">
        {showPreviousNext ? (
          <button type="button" className="icon-button media-button" aria-label="Previous" onClick={() => onCommand('previous')} disabled={!media.canGoPrevious}>
            <PreviousFilledIcon />
          </button>
        ) : null}
        {showArtwork && !isButtonsOnly ? (
          <div className="artwork-shell">
            {media.thumbnailDataUrl ? (
              <img src={media.thumbnailDataUrl} alt="" />
            ) : (
              <div className="artwork-placeholder">{title.slice(0, 2).toUpperCase()}</div>
            )}
            <button
              type="button"
              className="icon-button play-button artwork-play-button"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              onClick={() => onCommand('play-pause')}
              disabled={!media.canPlay && !media.canPause}
            >
              {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="icon-button play-button"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={() => onCommand('play-pause')}
            disabled={!media.canPlay && !media.canPause}
          >
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
        )}
        {showPreviousNext ? (
          <button type="button" className="icon-button media-button" aria-label="Next" onClick={() => onCommand('next')} disabled={!media.canGoNext}>
            <NextFilledIcon />
          </button>
        ) : null}
      </div>

      {canShowSeek || media.provider === 'yandex-direct' ? (
        <div className="progress-row">
          {media.provider === 'yandex-direct' ? (
            <button
              type="button"
              className={`reaction-button ${media.isDisliked ? 'reaction-button--active' : ''}`}
              aria-label={media.isDisliked ? 'Убрать дизлайк' : 'Не нравится'}
              aria-pressed={media.isDisliked}
              disabled={!media.canDislike}
              onClick={() => onCommand('dislike')}
            >
              <HeartCrack fill={media.isDisliked ? 'currentColor' : 'none'} />
            </button>
          ) : null}
          <button
            type="button"
            className={['progress-track', scrubRatio != null ? 'progress-track--scrubbing' : ''].join(' ')}
            aria-label="Seek track"
            onPointerDown={handleSeekPointerDown}
            onPointerMove={handleSeekPointerMove}
            onPointerUp={handleSeekPointerUp}
            onPointerCancel={handleSeekPointerCancel}
            onClick={(event) => event.preventDefault()}
            disabled={!media.canSeek}
            style={{ '--progress': activeRatio } as CSSProperties}
          >
            <span className="progress-fill" />
            <span className="progress-content progress-content--track" title={trackLabel}>
              <MarqueeText text={trackLabel} />
            </span>
            <span className="progress-content progress-content--time">
              {formatTime(activeProgressMs)} / {formatTime(media.durationMs)}
            </span>
          </button>
          {media.provider === 'yandex-direct' ? (
            <button
              type="button"
              className={`reaction-button reaction-button--like ${media.isLiked ? 'reaction-button--active' : ''}`}
              aria-label={media.isLiked ? 'Убрать из любимого' : 'Добавить в любимое'}
              aria-pressed={media.isLiked}
              disabled={!media.canLike}
              onClick={() => onCommand('like')}
            >
              <Heart fill={media.isLiked ? 'currentColor' : 'none'} />
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function PreviousFilledIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M6 5a1 1 0 0 1 1 1v4.22l8.48-5.09A1 1 0 0 1 17 6v12a1 1 0 0 1-1.52.86L7 13.78V18a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

function NextFilledIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M18 5a1 1 0 0 0-1 1v4.22L8.52 5.13A1 1 0 0 0 7 6v12a1 1 0 0 0 1.52.86L17 13.78V18a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1Z" />
    </svg>
  )
}
