import { useEffect, useState } from 'react'
import { LevelMeter, type GainTargetKind } from './LevelMeter'
import { SpectrumVisualizer } from './SpectrumVisualizer'
import { voicePluginApi, type AudioStats } from './pluginApi'

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
  targetKind,
  overloadLabel,
  comfortTip,
  yellTip,
  targetTip,
}: {
  running: boolean
  targetKind: GainTargetKind
  overloadLabel: string
  comfortTip: string
  yellTip: string
  targetTip: string
}) {
  const [stats, setStats] = useState<AudioStats>(emptyStats)
  const [peakHoldDb, setPeakHoldDb] = useState<number | null>(null)

  useEffect(() => {
    if (!running) {
      setStats(emptyStats)
      setPeakHoldDb(null)
      return
    }
    let cancelled = false
    const tick = async () => {
      try {
        const next = await voicePluginApi.getAudioStats()
        if (cancelled) return
        setStats(next)
        if (next.post_gain_peak > -90) {
          setPeakHoldDb((prev) => {
            if (prev == null || next.post_gain_peak >= prev) return next.post_gain_peak
            return Math.max(next.post_gain_peak, prev - 1.5)
          })
        }
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
  }, [running])

  return (
    <div className="voice-meters-elevated">
      <div className="voice-live-meters">
        <SpectrumVisualizer
          spectrumIn={stats.spectrum}
          spectrumOut={stats.spectrum_out}
          active={running}
        />
        <LevelMeter
          stats={stats}
          running={running}
          overloadLabel={overloadLabel}
          comfortTip={comfortTip}
          yellTip={yellTip}
          targetTip={targetTip}
          targetKind={targetKind}
          peakHoldDb={peakHoldDb}
        />
      </div>
    </div>
  )
}
