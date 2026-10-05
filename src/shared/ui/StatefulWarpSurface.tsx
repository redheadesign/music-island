import { WarpSurface } from './WarpSurface'
import type { WarpMaterialProps } from './WarpMaterial'
import { WARP_SPEED } from './warpPreset'
import './StatefulWarpSurface.css'

/** Complete Better Voice backdrop: opaque graphite base and stateful Paper Warp. */
export function StatefulWarpSurface({ running, className = '', ...props }: WarpMaterialProps & { running: boolean }) {
  return <div className={`stateful-warp-surface ${className}`} data-running={running} aria-hidden="true">
    <WarpSurface {...props} className="stateful-warp-surface__shader" speed={running ? WARP_SPEED.running : WARP_SPEED.resting} />
  </div>
}
