import { WarpMaterial } from '../../shared/ui/WarpMaterial'

/** Use the production fox field at a fixed phase for each exported frame. */
export function ReleaseBackdrop({ frame = 2200 }: { frame?: number }) {
  return <WarpMaterial frame={frame} maxPixelCount={450_000} style={{ opacity: .11, zIndex: -1 }} />
}
