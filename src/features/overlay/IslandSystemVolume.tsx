import { useSystemVolume } from '../../app/useIslandApp'
import type { Locale } from '../../shared/lib/types'
import { SystemVolumeControl } from '../music/SystemVolumeControl'

/** A hidden card can lay out its speaker before it needs native audio state. */
export function IslandSystemVolume({ locale, enabled = true }: { locale: Locale; enabled?: boolean }) {
  const audio = useSystemVolume(enabled)
  // A slider gesture belongs to the output on which it started.
  return <SystemVolumeControl key={audio.endpointId} locale={locale} audio={audio} />
}
