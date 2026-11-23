import { RotateCcw, RotateCw } from 'lucide-react'
import type { Locale } from '../../shared/lib/types'

export function SeekStepButton({ direction, disabled, onClick, locale = 'ru' }: { direction: 'seekBack' | 'seekForward'; disabled?: boolean; onClick?: () => void; locale?: Locale }) {
  const back = direction === 'seekBack'
  const label = locale === 'ru'
    ? back ? 'Назад на 10 секунд' : 'Вперёд на 10 секунд'
    : back ? 'Back 10 seconds' : 'Forward 10 seconds'
  const Icon = back ? RotateCcw : RotateCw
  return <button type="button" className="icon-button media-button media-navigation-button seek-step-button" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
    <Icon size={23} aria-hidden="true" /><span aria-hidden="true">10</span>
  </button>
}
