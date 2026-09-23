import { WarpMaterial } from '../../shared/ui/WarpMaterial'

/** The same quiet Paper Warp field used behind the approved classic films. */
export function ReleaseBackdrop({ frame = 2200 }: { frame?: number }) {
  return <WarpMaterial variant="onboarding" frame={frame} maxPixelCount={450_000} style={{ opacity: .11, zIndex: -1 }} />
}
