import { memo } from 'react'
import { StatefulWarpSurface } from '../../../shared/ui/StatefulWarpSurface'

/** A decorative material, not an audio meter. No microphone access or polling. */
export const VoiceAtmosphere = memo(function VoiceAtmosphere({
  running, active, reducedMotion = false,
}: { running: boolean; active: boolean; reducedMotion?: boolean }) {
  return (
    <StatefulWarpSurface
      className="voice-atmosphere"
      fieldClassName="voice-atmosphere__field"
      running={running}
      active={active}
      reducedMotion={reducedMotion}
    />
  )
})
