import type { ComponentProps } from 'react'
import { VoiceFoxVideoMascot } from './VoiceFoxVideoMascot'
import './VoiceFoxMascot.css'

export { FOX_CLIP_CATALOG, type FoxClipId } from './VoiceFoxVideoMascot'

export type VoiceFoxMascotSize = 'settings' | 'compact' | 'preview'

export interface VoiceFoxMascotProps extends ComponentProps<typeof VoiceFoxVideoMascot> {
  /** Settings: 208px, or 176px in containers up to 480px. Compact: 128px; preview: 255px. */
  size?: VoiceFoxMascotSize
  className?: string
}

/** Presentation owns geometry; the video component keeps the playback lifecycle. */
export function VoiceFoxMascot({
  size = 'settings',
  className,
  ...playbackProps
}: VoiceFoxMascotProps) {
  return (
    <div className={['voice-fox-mascot', `voice-fox-mascot--${size}`, className].filter(Boolean).join(' ')} aria-hidden>
      <VoiceFoxVideoMascot {...playbackProps} />
    </div>
  )
}
