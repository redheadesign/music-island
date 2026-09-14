import { Heart, Music2, Pause, Play, Repeat, Repeat1, Shuffle } from 'lucide-react'
import { Fragment } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Locale, MediaCommand, MediaSnapshot } from '../../shared/lib/types'
import { createTranslator, normalizeLocale } from '../../shared/i18n/messages'
import { TASKBAR_ELEMENT_LABELS, normalizeTaskbarLayout, type TaskbarElement, type TaskbarLayoutV1 } from '../../shared/lib/taskbarLayout'
import { IconButton } from '../../shared/ui/IconButton'
import { PreviousFilledIcon, NextFilledIcon } from '../music/MusicControls'
import './TaskbarPlayer.css'

export interface TaskbarPlayerProps {
  snapshot: MediaSnapshot | null
  locale: Locale
  reducedMotion?: boolean
  unavailable?: boolean
  onCommand: (command: MediaCommand) => void
  onOpenIsland?: () => void
  scale?: number
  showLike?: boolean
  layout?: TaskbarLayoutV1
  renderElement?: (element: TaskbarElement, node: ReactNode) => ReactNode
}

/** The same ordered controls used in the preview and the native taskbar renderer. */
export function TaskbarPlayer({ layout, showLike = false, scale = 1, renderElement = (_element, node) => node, reducedMotion, ...props }: TaskbarPlayerProps) {
  const elements = normalizeTaskbarLayout(layout ?? { elements: ['cover', 'previous', 'transport', 'next', ...(showLike ? ['like'] : [])] }).elements
  const coverGap = elements.includes('cover') && elements.at(-1) !== 'cover' ? 4 : 0
  const width = 12 + elements.length * 32 + coverGap
  return <section className="taskbar-player" aria-label={props.locale === 'ru' ? 'Плеер в панели задач' : 'Taskbar player'}
    style={{ '--taskbar-scale': Math.min(1.25, Math.max(.75, Number.isFinite(scale) ? scale : 1)), '--taskbar-width': `${width}px` } as CSSProperties}
    data-reduced-motion={reducedMotion || undefined} data-empty={!props.snapshot?.hasSession || undefined}>
    {elements.map((element) => <Fragment key={element}>{renderElement(element, <TaskbarControl element={element} {...props} />)}</Fragment>)}
  </section>
}

export function TaskbarControl({ element, snapshot, locale, unavailable, onCommand, onOpenIsland }: Pick<TaskbarPlayerProps, 'snapshot' | 'locale' | 'unavailable' | 'onCommand' | 'onOpenIsland'> & { element: TaskbarElement }) {
  const language = normalizeLocale(locale)
  const ru = language === 'ru'
  const t = createTranslator(language)
  const hasSession = Boolean(snapshot?.hasSession && !unavailable && !(snapshot.provider === 'smtc' && snapshot.smtcHealth === 'unavailable'))
  const playing = hasSession && snapshot?.playbackStatus === 'playing'
  if (element === 'cover') {
    const trackLabel = hasSession
      ? `${snapshot?.title?.trim() || t('music.unknownTrack')} · ${snapshot?.artist?.trim() || 'Music Island'}`
      : t(snapshot?.provider === 'yandex-direct' ? 'music.directOffline' : 'music.noSession')
    const artwork = <span className="taskbar-player__artwork" aria-hidden="true">{hasSession && snapshot?.thumbnailDataUrl ? <img src={snapshot.thumbnailDataUrl} alt="" draggable={false} /> : <Music2 size={16} />}</span>
    return onOpenIsland ? <button type="button" className="taskbar-player__cover taskbar-player__cover--button" aria-label={`${ru ? 'Открыть островок' : 'Open island'} · ${trackLabel}`} title={trackLabel} onClick={onOpenIsland}>{artwork}</button>
      : <div className="taskbar-player__cover" role="img" aria-label={trackLabel} title={trackLabel}>{artwork}</div>
  }
  const label = element === 'transport' ? playing ? ru ? 'Пауза' : 'Pause' : ru ? 'Воспроизвести' : 'Play' : TASKBAR_ELEMENT_LABELS[language][element]
  const supported = hasSession && Boolean(element === 'transport' ? playing ? snapshot?.canPause : snapshot?.canPlay
    : element === 'previous' ? snapshot?.canGoPrevious : element === 'next' ? snapshot?.canGoNext
      : element === 'like' ? snapshot?.canLike : element === 'shuffle' ? snapshot?.canShuffle : snapshot?.canRepeat)
  const pressed = element === 'like' ? snapshot?.isLiked === true : element === 'shuffle' ? snapshot?.isShuffleActive === true : element === 'repeat' ? Boolean(snapshot?.repeatMode && snapshot.repeatMode !== 'off') : undefined
  const command = element === 'transport' ? 'play-pause' : element === 'shuffle' ? 'toggle-shuffle' : element === 'repeat' ? 'cycle-repeat' : element
  return <IconButton className={`taskbar-player__button${element === 'transport' ? ' taskbar-player__button--play' : ''}`} aria-label={label} title={supported ? label : ru ? `${label} · недоступно в этом плеере` : `${label} · unavailable in this player`} aria-pressed={pressed} disabled={!supported} onClick={() => onCommand(command)}>
    {element === 'previous' ? <PreviousFilledIcon size={14} /> : element === 'next' ? <NextFilledIcon size={14} />
      : element === 'transport' ? playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />
        : element === 'like' ? <Heart size={14} fill={pressed ? 'currentColor' : 'none'} />
          : element === 'shuffle' ? <Shuffle size={14} /> : snapshot?.repeatMode === 'one' ? <Repeat1 size={14} /> : <Repeat size={14} />}
    {pressed && (element === 'shuffle' || element === 'repeat') ? <span className="taskbar-player__active-dot" aria-hidden="true" /> : null}
  </IconButton>
}
