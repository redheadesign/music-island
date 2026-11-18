import { Music2, RotateCw, Unplug } from 'lucide-react'
import { Fragment, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { islandArrangement, type IslandMusicElement, type IslandLayout, type IslandLayoutElement, type IslandLayoutZone } from '../../shared/lib/islandLayout'
import { MediaArtwork, NavigationButton, PlaybackButton, ReactionButton, PlaybackModeButton } from './MusicControls'
import type { Locale, MediaCommand, MediaSnapshot } from '../../shared/lib/types'
import { createTranslator, normalizeLocale } from '../../shared/i18n/messages'
import { formatTime } from '../../shared/lib/format'
import { SeekStepButton } from './SeekStepButton'
import { ProgressStrip } from './ProgressStrip'
import { progressTrackKey, type ProgressNavigation } from './progressTransition'
import { Button } from '../../shared/ui/SettingsControls'
import './MusicModule.css'

interface MusicModuleProps {
  layout?: IslandLayout
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
  const seekTrackRef = useRef<string | null>(null)
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
      <section className={`music-module music-module--empty${isDirect ? ' music-module--direct-offline' : ''}`} aria-label={emptyTitle} aria-busy={restarting || undefined}>
        <span className="music-empty-icon" aria-hidden="true">{isDirect ? <Unplug size={22} /> : <Music2 size={22} />}</span>
        <div className="music-empty-copy">
          <strong>{emptyTitle}</strong>
          {!restarting && (!isDirect || !onDirectReload) ? <span>{t(isDirect ? 'music.directOfflineHint' : 'music.noSessionHint')}</span> : null}
        </div>
        {isDirect && onDirectReload ? (
          <Button
            variant="primary"
            className="direct-reload-button"
            disabled={directReloadBusy}
            onClick={() => onDirectReload()}
          >
            <RotateCw size={18} aria-hidden="true" />
            {directReloadBusy ? t('music.reloading') : t('music.quickReload')}
          </Button>
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

    if (commit && seekTrackRef.current === trackKey && !seekSentRef.current && media.durationMs && media.canSeek) {
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
    seekTrackRef.current = trackKey
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

  const handleSeekKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const duration = media.durationMs
    if (!media.canSeek || !duration || event.altKey || event.ctrlKey || event.metaKey) return
    const position = activeProgressMs ?? Math.round(activeRatio * duration)
    let target: number
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown': target = position - 5000; break
      case 'ArrowRight':
      case 'ArrowUp': target = position + 5000; break
      case 'Home': target = 0; break
      case 'End': target = duration; break
      default: return
    }
    event.preventDefault()
    event.stopPropagation()
    onCommand({ seek: { positionMs: Math.min(duration, Math.max(0, target)) } })
  }

  const player: IslandMusicElement[] = layout?.zones.player ?? ['previous', 'artwork', 'transport', 'next']
  const lower: IslandMusicElement[] = layout?.zones.playerLower ?? (media.provider === 'yandex-direct' ? ['dislike', 'progress', 'like'] : ['progress'])
  const hasArtwork = showArtwork && !isButtonsOnly && (player.includes('artwork') || lower.includes('artwork'))
  const control = (element: IslandMusicElement) => {
    if (element === 'previous' || element === 'next') {
      return showPreviousNext ? <NavigationButton locale={locale} direction={element} onClick={() => navigate(element)} disabled={element === 'previous' ? !media.canGoPrevious : !media.canGoNext} /> : null
    }
    if (element === 'seekBack' || element === 'seekForward') {
      const duration = media.durationMs ?? 0
      const position = progressMs ?? media.positionMs
      const target = position == null ? null : Math.max(0, Math.min(duration, position + (element === 'seekBack' ? -10_000 : 10_000)))
      return <SeekStepButton direction={element} locale={locale} disabled={!media.canSeek || !duration || target == null || target === position}
        onClick={() => { if (target != null) onCommand({ seek: { positionMs: target } }) }} />
    }
    if (element === 'artwork') return hasArtwork ? <MediaArtwork locale={locale} reducedMotion={reducedMotion} src={media.thumbnailDataUrl} title={title} playing={isPlaying} onClick={() => onCommand('play-pause')} disabled={!media.canPlay && !media.canPause} /> : null
    if (element === 'transport') return hasArtwork ? null : <PlaybackButton locale={locale} reducedMotion={reducedMotion} playing={isPlaying} onClick={() => onCommand('play-pause')} disabled={!media.canPlay && !media.canPause} />
    if (isButtonsOnly) return null
    if (element === 'shuffle' || element === 'repeat') return <PlaybackModeButton kind={element} active={media.isShuffleActive} repeatMode={media.repeatMode} disabled={element === 'shuffle' ? !media.canShuffle : !media.canRepeat} locale={locale} onClick={() => onCommand(element === 'shuffle' ? 'toggle-shuffle' : 'cycle-repeat')} />
    if (element === 'like' || element === 'dislike') return <ReactionButton key={trackKey} locale={locale} reducedMotion={reducedMotion} kind={element} active={element === 'like' ? media.isLiked : media.isDisliked} disabled={element === 'like' ? !media.canLike : !media.canDislike} onClick={() => onCommand(element)} />
    if (element !== 'progress' || !showProgress || (!canShowSeek && media.provider !== 'yandex-direct')) return null
    return <button
      type="button"
      className={['progress-track', scrubRatio != null ? 'progress-track--scrubbing' : ''].join(' ')}
      role="slider"
      aria-label={t('music.seek')}
      aria-valuemin={0}
      aria-valuemax={(media.durationMs ?? 0) / 1000}
      aria-valuenow={Math.max(0, Math.min(activeProgressMs ?? 0, media.durationMs ?? 0)) / 1000}
      aria-valuetext={t('music.seekTime').replace('{position}', formatTime(activeProgressMs)).replace('{duration}', formatTime(media.durationMs))}
      onKeyDown={handleSeekKey}
      onPointerDown={handleSeekPointerDown}
      onPointerMove={handleSeekPointerMove}
      onPointerUp={handleSeekPointerUp}
      onPointerCancel={handleSeekPointerCancel}
      onClick={(event) => event.preventDefault()}
      disabled={!media.canSeek || !media.durationMs}
      style={{ '--progress': activeRatio } as CSSProperties}
    >
      <ProgressStrip frame={{ trackKey, ratio: activeRatio, positionMs: activeProgressMs, durationMs: media.durationMs, label: trackLabel }} navigation={navigation} reducedMotion={reducedMotion} scrubbing={scrubRatio != null} />
    </button>
  }
  const renderRow = (zone: 'player' | 'playerLower', order: readonly IslandMusicElement[]) => {
    const contents = order.flatMap(element => {
      const node = control(element)
      return node ? [<Fragment key={element}>{renderElement(element, node)}</Fragment>] : []
    })
    const row = contents.length ? <div className={`media-controls media-controls--island player-row${order.includes('progress') ? ' progress-row' : ''}`}
      data-compact={contents.length > 5 || undefined} aria-label={t('music.controls')}>{contents}</div> : null
    return renderZone(zone, row)
  }

  return (
    <section className={`music-module music-module--${density}`} data-arrangement={layout ? islandArrangement(layout) : 'stacked'} aria-label={t('music.nowPlaying')}>
      {recoveryBanner}
      {renderRow('player', player)}
      {renderRow('playerLower', lower)}
    </section>
  )
}
