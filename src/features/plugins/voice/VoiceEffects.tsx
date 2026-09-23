import { Bot, Check, Radio, Zap } from '../../../shared/ui/SettingsIcons'
import type { Locale } from '../../../shared/lib/types'
import { EXPLODE_EFFECTS } from './presets'
import './VoiceEffects.css'

export function VoiceEffects({ locale, label, disabled = false, activeEffect, onToggle }: {
  locale: Locale
  label: string
  disabled?: boolean
  activeEffect: number | null
  onToggle: (effect: number) => void
}) {
  return (
    <div className="voice-quick-effects" role="group" aria-label={label}>
      <div className="voice-quick-effects__buttons">
        {EXPLODE_EFFECTS.map((effect) => {
          const isActive = activeEffect === effect.value
          const Icon = isActive ? Check : effect.key === 'robot' ? Bot : effect.key === 'echo' ? Radio : Zap
          return (
            <button key={effect.value} type="button" className="voice-effect-toggle"
              aria-pressed={isActive} disabled={disabled}
              onClick={() => onToggle(effect.value)}>
              <Icon size={14} aria-hidden />
              <span>{locale === 'ru' ? effect.labelRu : effect.labelEn}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
