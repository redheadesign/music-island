import { Music2, RotateCw, Unplug } from 'lucide-react'
import { Fragment, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import type { IslandLayoutV1, IslandLayoutElement, IslandLayoutZone, IslandReactionElement } from '../../shared/lib/islandLayout'
import { MediaArtwork, NavigationButton, PlaybackButton, ReactionButton, PlaybackModeButton } from './MusicControls'
import type { Locale, MediaCommand, MediaSnapshot } from '../../shared/lib/types'
import { createTranslator, normalizeLocale } from '../../shared/i18n/messages'
import { ProgressStrip } from './ProgressStrip'
import { progressTrackKey, type ProgressNavigation } from './progressTransition'
import './MusicModule.css'

interface MusicModuleProps {
  layout?: IslandLayoutV1
  renderElement?: (element: IslandLayoutElement, node: ReactNode) => ReactNode
  renderZone?: (zone: IslandLayoutZone, node: ReactNode) => ReactNode
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
  locale?: Locale
  reducedMotion?: boolean
  onCommand: (command: MediaCommand) => void
  showDirectReload?: boolean
  directReloadBusy?: boolean
  onDirectReload?: () => void
}

function collapseRepeatedTitle(value: string): string {
  const t = value.replace(/\s+/g, ' ').trim()
  if (t.length < 2) return t
  for (let n = 2; n <= 4; n += 1) {
    if (t.length % n !== 0) continue
    const chunk = t.slice(0, t.length / n)
    if (chunk && chunk.repeat(n) === t) return chunk.trim()
  }
  return t
}

export function MusicModule({
  layout,
  renderElement = (_element, node) => node,
  renderZone = (_zone, node) => node,
  media,
  progressMs,
  progressPercent,
  density,
  showArtwork,
  showTitle,
  showArtist,
  showProgress,
  showPreviousNext,
  locale = 'ru',
  reducedMotion = false,
  onCommand,
  showDirectReload = false,
  directReloadBusy = false,
  onDirectReload,
}: MusicModuleProps) {
  const [scrubRatio, setScrubRatio] = useState<number | null>(null)
  const [navigation, setNavigation] = useState<ProgressNavigation | null>(null)
  const navigationId = useRef(0)
  const scrubbingRef = useRef(false)
  const seekGestureIdRef = useRef<number | null>(null)
  const seekSentRef = useRef(false)
  const t = useMemo(() => createTranslator(normalizeLocale(locale)), [locale])

  if (media?.provider === 'smtc' && media.smtcHealth === 'unavailable') {
    return (
      <section className="music-module music-module--empty music-module--warning" aria-label={t('music.smtcUnavailable')}>
        <span className="music-empty-icon" aria-hidden="true"><Unplug size={22} /></span>
        <div className="music-empty-copy">
          <strong>{t('music.smtcUnavailable')}</strong>
          <span>{t('music.smtcUnavailableHint')}</span>
        </div>
      </section>
    )
  }

  if (!media?.hasSession) {
    const isDirect = media?.provider === 'yandex-direct'
    const restarting = isDirect && directReloadBusy
    const emptyTitle = restarting ? t('music.directRestarting') : isDirect ? t('music.directOffline') : t('music.noSession')
    return (
      <section className="music-module music-module--empty" aria-label={emptyTitle} aria-busy={restarting || undefined}>
        <span className="music-empty-icon" aria-hidden="true">{isDirect ? <Unplug size={22} /> : <Music2 size={22} />}</span>
        <div className="music-empty-copy">
          <strong>{emptyTitle}</strong>
          <span>{restarting ? t('music.directRestartingHint') : isDirect ? t('music.directOfflineHint') : t('music.noSessionHint')}</span>
        </div>
        {isDirect && onDirectReload ? (
          <button
            type="button"
            className="direct-reload-button"
            disabled={directReloadBusy}
            onClick={() => onDirectReload()}
          >
            <RotateCw size={14} aria-hidden="true" />
            {directReloadBusy ? t('music.reloading') : t('music.quickReload')}
          </button>
        ) : null}
      </section>
    )
  }

  const isPlaying = media.playbackStatus === 'playing'
  const title = collapseRepeatedTitle(media.title || t('music.unknownTrack'))
  const artist = media.artist ? collapseRepeatedTitle(media.artist) : null
  const isButtonsOnly = density === 'buttons-only'
  const canShowSeek = showProgress && !isButtonsOnly && Boolean(media.durationMs)
  const trackLabel = [
    showArtist ? artist : null,
    showTitle ? title : null,
  ].filter(Boolean).join(' · ') || title
  const activeRatio = scrubRatio ?? progressPercent / 100
  const activeProgressMs =
    scrubRatio != null && media.durationMs
      ? Math.round(media.durationMs * scrubRatio)
      : progressMs
  const trackKey = progressTrackKey(media)
  const navigate = (direction: 'next' | 'previous') => {
    setNavigation({ id: ++navigationId.current, direction, fromTrackKey: trackKey, fromPositionMs: progressMs, requestedAt: Date.now() })
    onCommand(direction)
  }
  const recoveryBanner = showDirectReload && onDirectReload ? (
    <div className="direct-reload-banner">
      <span>{t('music.directDropped')}</span>
      <button
        type="button"
        className="direct-reload-button"
        disabled={directReloadBusy}
        onClick={() => onDirectReload()}
      >
        <RotateCw size={14} aria-hidden="true" />
        {directReloadBusy ? t('music.reloading') : t('music.quickReload')}
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

  const controlOrder = layout?.zones.player ?? ['previous', 'artwork', 'transport', 'next', 'progress']
  const hasArtwork = showArtwork && !isButtonsOnly && controlOrder.includes('artwork')
  const control = (element: IslandLayoutElement) => {
    if (element === 'previous' || element === 'next') {
      return showPreviousNext ? <NavigationButton direction={element} onClick={() => navigate(element)} disabled={element === 'previous' ? !media.canGoPrevious : !media.canGoNext} /> : null
    }
    if (element === 'artwork') return hasArtwork ? <MediaArtwork reducedMotion={reducedMotion} src={media.thumbnailDataUrl} title={title} playing={isPlaying} onClick={() => onCommand('play-pause')} disabled={!media.canPlay && !media.canPause} /> : null
    if (element === 'transport') return hasArtwork ? null : <PlaybackButton reducedMotion={reducedMotion} playing={isPlaying} onClick={() => onCommand('play-pause')} disabled={!media.canPlay && !media.canPause} />
    return null
  }
  const reactions = (side: 'reactionLeft' | 'reactionRight') => {
    const elements: IslandReactionElement[] = layout?.zones[side] ?? (media.provider === 'yandex-direct' ? side === 'reactionLeft' ? ['dislike'] : ['like'] : [])
    return renderZone(side, !isButtonsOnly && elements.length ? <div className="music-reactions">{elements.map((kind) => <Fragment key={kind}>{renderElement(kind,
      kind === 'shuffle' || kind === 'repeat'
        ? <PlaybackModeButton kind={kind} active={media.isShuffleActive} repeatMode={media.repeatMode} disabled={kind === 'shuffle' ? !media.canShuffle : !media.canRepeat} locale={locale} onClick={() => onCommand(kind === 'shuffle' ? 'toggle-shuffle' : 'cycle-repeat')} />
        : <ReactionButton locale={locale} reducedMotion={reducedMotion} kind={kind} active={kind === 'like' ? media.isLiked : media.isDisliked} disabled={kind === 'like' ? !media.canLike : !media.canDislike} onClick={() => onCommand(kind)} />
    )}</Fragment>)}</div> : null)
  }

  return (
    <section className={`music-module music-module--${density}`} aria-label="Now playing">
      {recoveryBanner}
      {renderZone('player', <div className="media-controls media-controls--island" aria-label="Playback controls">
        {controlOrder.map((element) => { const node = control(element); return node ? <Fragment key={element}>{renderElement(element, node)}</Fragment> : null })}
      </div>)}
      {!isButtonsOnly ? <div className="progress-row">
        {reactions('reactionLeft')}
        {showProgress && (canShowSeek || media.provider === 'yandex-direct') ? renderElement('progress', <button
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
          <ProgressStrip frame={{ trackKey, ratio: activeRatio, positionMs: activeProgressMs, durationMs: media.durationMs, label: trackLabel }} navigation={navigation} reducedMotion={reducedMotion} scrubbing={scrubRatio != null} />
        </button>) : renderElement('progress', null)}
        {reactions('reactionRight')}
      </div> : null}
    </section>
  )
}
