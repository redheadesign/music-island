import type { ComponentPropsWithoutRef } from 'react'
import { Mic, Pin, PinOff, Square } from 'lucide-react'
import type { IslandActionElement } from '../lib/islandLayout'
import { SettingsFilled } from './SettingsIcons'

type Props = Omit<ComponentPropsWithoutRef<'button'>, 'className' | 'children' | 'aria-label' | 'aria-pressed'> & {
  action: IslandActionElement
  label: string
  active?: boolean
}

export function IslandActionButton({ action, label, active, title = label, ...props }: Props) {
  const Icon = action === 'pin' ? (active ? PinOff : Pin) : (active ? Square : Mic)
  return (
    <button {...props} type="button" data-island-control="floating" data-island-action={action}
      className={`icon-button${action === 'settings' ? ' island-settings-button' : ''}`}
      aria-label={label} title={title} aria-pressed={active}>
      {action === 'settings'
        ? <SettingsFilled weight="fill" size={16} aria-hidden="true" />
        : <Icon size={action === 'microphone' && active ? 14 : 16}
            fill={action === 'microphone' && active ? 'currentColor' : 'none'} aria-hidden="true" />}
    </button>
  )
}
