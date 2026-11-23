import { Volume, Volume1, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Locale } from '../../shared/lib/types'
import { RangeSlider } from '../../shared/ui/RangeSlider'
import './SystemVolumeControl.css'

export interface VolumeControls {
  volume: number
  muted: boolean
  available: boolean
  toggleMute(): void
  setVolume(value: number): void
}

interface VolumePanel {
  side: 'left' | 'right'
  width: number
}

/** The island can be scaled by Windows and by the user. Keep the entire slider
 * inside the player's existing native hit region, in the same row as the icon. */
function panelPlacement(control: HTMLElement): VolumePanel {
  const player = control.closest<HTMLElement>('.music-module')
  const rect = control.getBoundingClientRect()
  if (!player || !rect.width || !control.offsetWidth) return { side: 'right', width: 128 }
  const bounds = player.getBoundingClientRect()
  const left = rect.left - bounds.left
  const right = bounds.right - rect.right
  const scale = rect.width / control.offsetWidth
  return { side: left > right ? 'left' : 'right', width: Math.max(0, Math.min(128, Math.floor(Math.max(left, right) / scale))) }
}

/** A missing controller renders the same speaker as an inert layout sample. */
export function SystemVolumeControl({ locale = 'ru', audio }: { locale?: Locale; audio?: VolumeControls }) {
  const group = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const dragging = useRef(false)
  const pointerInput = useRef(false)
  const focusSlider = useRef(false)
  const [panel, setPanel] = useState<VolumePanel | null>(null)
  const open = Boolean(panel && audio?.available)
  useEffect(() => {
    if (!open) return
    const dismissHoveredPanel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null)
    }
    document.addEventListener('keydown', dismissHoveredPanel)
    return () => document.removeEventListener('keydown', dismissHoveredPanel)
  }, [open])
  useLayoutEffect(() => {
    if (focusSlider.current && panel) {
      focusSlider.current = false
      group.current?.querySelector('input')?.focus()
    }
  }, [panel])
  const ru = locale === 'ru'
  const volume = audio?.volume ?? 64
  const muted = audio?.muted ?? false
  const title = ru ? 'Системная громкость' : 'System volume'
  const action = muted ? (ru ? 'Включить системный звук' : 'Unmute system sound') : (ru ? 'Выключить системный звук' : 'Mute system sound')
  const unavailable = ru ? 'Нет устройства вывода звука' : 'No audio output device'
  const Speaker = muted ? VolumeX : volume === 0 ? Volume : volume < 50 ? Volume1 : Volume2
  const reveal = () => {
    if (audio?.available && group.current) setPanel(panelPlacement(group.current))
  }
  return <div ref={group} className="system-volume" data-open={open || undefined}
    onPointerEnter={reveal}
    onPointerDownCapture={() => { pointerInput.current = true }}
    onPointerLeave={() => {
      if (!dragging.current && (pointerInput.current || !group.current?.contains(document.activeElement))) setPanel(null)
    }}
    onFocus={reveal}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        pointerInput.current = false
        setPanel(null)
      }
    }}
    onKeyDown={event => {
      pointerInput.current = false
      if (event.key === 'Escape' && panel) {
        event.preventDefault()
        event.stopPropagation()
        button.current?.focus()
        setPanel(null)
      }
      if (event.key === 'ArrowDown' && event.target === button.current) {
        event.preventDefault()
        focusSlider.current = true
        reveal()
      }
    }}>
    <button ref={button} type="button" data-island-control="button" className="icon-button media-button system-volume__button"
      aria-label={audio ? action : title} title={audio?.available === false ? unavailable : action}
      tabIndex={audio ? undefined : -1} disabled={audio?.available === false}
      onClick={() => audio?.toggleMute()}>
      <Speaker size={20} aria-hidden="true" />
    </button>
    {panel && audio?.available ? <div className="system-volume__panel" data-side={panel.side} style={{ width: panel.width }}>
      <RangeSlider aria-label={title} aria-valuetext={`${volume}%`} value={volume}
        onChange={event => audio.setVolume(event.currentTarget.valueAsNumber)}
        onPointerDown={event => { dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerUp={event => {
          dragging.current = false
          if (!group.current?.contains(document.elementFromPoint(event.clientX, event.clientY))) setPanel(null)
        }}
        onLostPointerCapture={() => { dragging.current = false }}
        onPointerCancel={() => { dragging.current = false; setPanel(null) }} />
    </div> : null}
  </div>
}
