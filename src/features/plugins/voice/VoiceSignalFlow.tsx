import { AudioLines, Mic2, Volume2 } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { DarkSelect } from './DarkSelect'
import { levelToPct } from './levels'
import type { AudioStats } from './pluginApi'
import { SpectrumVisualizer } from './SpectrumVisualizer'
import './VoiceSignalFlow.css'

type DeviceEndpoint = {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}

export function VoiceSignalFlow({
  input,
  output,
  processingLabel,
  runningLabel,
  stoppedLabel,
  running,
  meterActive,
  reducedMotion,
  stats,
}: {
  input: DeviceEndpoint
  output: DeviceEndpoint
  processingLabel: string
  runningLabel: string
  stoppedLabel: string
  running: boolean
  meterActive: boolean
  reducedMotion: boolean
  stats: AudioStats
}) {
  const flowing = meterActive && !reducedMotion

  return (
    <div
      className={['voice-signal-flow', flowing ? 'voice-signal-flow--flowing' : ''].filter(Boolean).join(' ')}
      data-signal-active={flowing}
      role="group"
      aria-label={processingLabel}
    >
      <div className="voice-signal-flow__route" aria-hidden="true">
        <span className="voice-signal-flow__pulse" />
      </div>

      <SignalEndpoint
        kind="input"
        icon={<Mic2 size={17} aria-hidden />}
        endpoint={input}
        levelDb={stats.input_peak}
        active={meterActive}
        hot={meterActive && stats.input_clipping}
      />

      <div className="voice-signal-node voice-signal-node--processing" aria-label={running ? runningLabel : stoppedLabel} data-running={running}>
        <div className="voice-signal-node__header">
          <span className="voice-signal-node__icon"><AudioLines size={17} aria-hidden /></span>
          <strong>{processingLabel}</strong>
        </div>
        <SpectrumVisualizer
          spectrumIn={stats.spectrum}
          spectrumOut={stats.spectrum_out}
          active={meterActive}
          reducedMotion={reducedMotion}
          compact
        />
      </div>

      <SignalEndpoint
        kind="output"
        icon={<Volume2 size={17} aria-hidden />}
        endpoint={output}
        levelDb={stats.post_gain_peak}
        active={meterActive}
      />
    </div>
  )
}

function SignalEndpoint({
  kind,
  icon,
  endpoint,
  levelDb,
  active,
  hot = false,
}: {
  kind: 'input' | 'output'
  icon: ReactNode
  endpoint: DeviceEndpoint
  levelDb: number
  active: boolean
  hot?: boolean
}) {
  const level = active ? levelToPct(levelDb) : 0

  return (
    <div className={`voice-signal-node voice-signal-node--${kind}`}>
      <div className="voice-signal-node__header">
        <span className="voice-signal-node__icon">{icon}</span>
        <strong>{endpoint.label}</strong>
      </div>
      <DarkSelect
        ariaLabel={endpoint.label}
        value={endpoint.value}
        options={endpoint.options.map((device) => ({ value: device, label: device }))}
        onChange={endpoint.onChange}
      />
      <div
        className={['voice-signal-meter', hot ? 'voice-signal-meter--hot' : ''].filter(Boolean).join(' ')}
        role="meter"
        aria-label={endpoint.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level)}
        style={{ '--voice-signal-level': `${level}%` } as CSSProperties}
      >
        <span className="voice-signal-meter__fill" />
      </div>
    </div>
  )
}
