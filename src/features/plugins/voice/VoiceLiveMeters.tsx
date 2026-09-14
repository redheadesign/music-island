import { useEffect, useState } from 'react'
import { voicePluginApi, type AudioStats } from './pluginApi'
import { VoiceSignalFlow } from './VoiceSignalFlow'

const emptyStats: AudioStats = {
  input_level: -100,
  output_level: -100,
  input_peak: -100,
  post_gain_peak: -100,
  input_clipping: false,
  noise_reduction_db: 0,
  latency_ms: 0,
  cpu_usage: 0,
  frames_processed: 0,
  spectrum: [],
  spectrum_out: [],
  frames_dropped: 0,
}

/** Isolated polling so spectrum/meters don't re-render the whole settings tree. */
export function VoiceLiveMeters({
  running,
  active = true,
  reducedMotion = false,
  input,
  output,
  processingLabel,
  runningLabel,
  stoppedLabel,
}: {
  running: boolean
  /** Pause polling when the voice tab / settings window is not visible. */
  active?: boolean
  reducedMotion?: boolean
  input: { label: string; value: string; options: string[]; onChange: (value: string) => void }
  output: { label: string; value: string; options: string[]; onChange: (value: string) => void }
  processingLabel: string
  runningLabel: string
  stoppedLabel: string
}) {
  const [stats, setStats] = useState<AudioStats>(emptyStats)
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )

  useEffect(() => {
    const updateVisibility = () => setDocumentVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  const meterActive = running && active && documentVisible

  useEffect(() => {
    if (!meterActive) {
      if (!running) {
        setStats(emptyStats)
      }
      return
    }
    let cancelled = false
    const tick = async () => {
      try {
        const next = await voicePluginApi.getAudioStats()
        if (cancelled) return
        setStats(next)
      } catch {
        /* ignore */
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 250)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [running, meterActive])

  return (
    <VoiceSignalFlow
      input={input}
      output={output}
      processingLabel={processingLabel}
      runningLabel={runningLabel}
      stoppedLabel={stoppedLabel}
      running={running}
      meterActive={meterActive}
      reducedMotion={reducedMotion}
      stats={stats}
    />
  )
}
