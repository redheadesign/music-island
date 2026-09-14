import { memo } from 'react'
import { WarpMaterial } from '../../../shared/ui/WarpMaterial'
import './VoiceAtmosphere.css'

/** A decorative material, not an audio meter. No microphone access or polling. */
export const VoiceAtmosphere = memo(function VoiceAtmosphere({
  running, active, reducedMotion = false,
}: { running: boolean; active: boolean; reducedMotion?: boolean }) {
  return (
    <WarpMaterial
      className="voice-atmosphere"
      fieldClassName="voice-atmosphere__field"
      data-running={running}
      speed={running ? 2.1 : 0.225}
      active={active}
      reducedMotion={reducedMotion}
    />
  )
})
