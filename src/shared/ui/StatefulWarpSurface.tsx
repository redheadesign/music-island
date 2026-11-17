import { WarpSurface } from './WarpSurface'
import type { WarpMaterialProps } from './WarpMaterial'
import { WARP_SPEED } from './warpPreset'
import './StatefulWarpSurface.css'

/** Preview backdrop with a solid base and a theme renderer that responds to activation. */
export function StatefulWarpSurface({ running, className = '', ...props }: WarpMaterialProps & { running: boolean }) {
  return <div className={`stateful-warp-surface ${className}`} data-running={running} aria-hidden="true">
    <WarpSurface {...props} className="stateful-warp-surface__shader" speed={running ? WARP_SPEED.running : WARP_SPEED.resting} />
  </div>
}
