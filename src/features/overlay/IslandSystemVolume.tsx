import { useSystemVolume } from '../../app/useIslandApp'
import type { Locale } from '../../shared/lib/types'
import { SystemVolumeControl } from '../music/SystemVolumeControl'

/** Only the expanded island mounts this adapter. Layout previews use an inert speaker. */
export function IslandSystemVolume({ locale }: { locale: Locale }) {
  const audio = useSystemVolume(true)
  // A slider gesture belongs to the output on which it started.
  return <SystemVolumeControl key={audio.endpointId} locale={locale} audio={audio} />
}
