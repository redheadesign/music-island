import { useState } from 'react'
import { Heart, HeartCrack } from 'lucide-react'
import type { Locale } from '../../shared/lib/types'
import { localHeartDuration } from '../../shared/ui/islandBassEffect'
import './ReactionButton.css'

const labels = {
  ru: { like: ['Добавить в любимое', 'Убрать из любимого'], dislike: ['Не нравится', 'Убрать дизлайк'] },
  en: { like: ['Like', 'Remove like'], dislike: ['Dislike', 'Remove dislike'] },
}

type Props = {
  kind: 'like' | 'dislike'
  active?: boolean
  disabled?: boolean
  reducedMotion?: boolean
  locale?: Locale
  onClick?: () => void
}

export function ReactionButton({ kind, active = false, disabled, onClick, reducedMotion, locale = 'ru' }: Props) {
  const [press, setPress] = useState(0)
  const Icon = kind === 'like' ? Heart : HeartCrack
  const label = labels[locale][kind][Number(active)]
  return <button type="button" data-island-control="button" className={`reaction-button reaction-button--${kind}${active ? ' reaction-button--active' : ''}`}
    aria-label={label} aria-pressed={active} title={label} disabled={disabled}
    data-reduced-motion={reducedMotion || undefined}
    onClick={event => {
      const motionAllowed = !reducedMotion
        && !event.currentTarget.closest('.reduced-motion, [data-reduced-motion="true"]')
        && !matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)').matches
      const pulse = motionAllowed && kind === 'like' && !active
      const duration = pulse && localHeartDuration(event.currentTarget)
      if (duration) event.currentTarget.style.setProperty('--heart-duration', `${duration}ms`)
      else event.currentTarget.style.removeProperty('--heart-duration')
      setPress(sequence => pulse ? sequence + 1 : 0)
      onClick?.()
    }}>
    <span key={press} className="reaction-glyph" data-pulse={press > 0 || undefined}>
      <Icon aria-hidden="true" fill={active ? 'currentColor' : 'none'}
        onAnimationEnd={event => { if (event.animationName === 'like-heartbeat') setPress(0) }} />
    </span>
  </button>
}
