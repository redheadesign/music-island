import { motion } from 'framer-motion'
import type { AudioStats } from './pluginApi'
import {
  IN_COMFORT_PEAK_DB,
  IN_YELL_PEAK_DB,
  TARGET_CALLS_PEAK_DB,
  TARGET_CONTENT_PEAK_DB,
  levelToPct,
} from './levels'
import { ChartTipAnchor } from './ChartTip'

export type GainTargetKind = 'calls' | 'content' | 'custom'

export function LevelMeter({
  stats,
  running,
  overloadLabel,
  comfortTip,
  yellTip,
  targetTip,
  targetKind,
  peakHoldDb,
}: {
  stats: AudioStats
  running: boolean
  overloadLabel: string
  comfortTip: string
  yellTip: string
  targetTip: string
  targetKind: GainTargetKind
  peakHoldDb: number | null
}) {
  const inPct = running ? levelToPct(stats.input_peak) : 0
  const outPct = running ? levelToPct(stats.post_gain_peak) : 0
  const clipping = running && stats.input_clipping
  const holdPct =
    peakHoldDb != null && Number.isFinite(peakHoldDb) ? levelToPct(peakHoldDb) : null

  const targetDb =
    targetKind === 'calls'
      ? TARGET_CALLS_PEAK_DB
      : targetKind === 'content'
        ? TARGET_CONTENT_PEAK_DB
        : null

  return (
    <div className="voice-level-meter">
      {clipping ? <p className="voice-overload-banner">{overloadLabel}</p> : null}
      <MeterRow
        label="In"
        pct={inPct}
        hot={clipping}
        marks={[
          { db: IN_COMFORT_PEAK_DB, tip: comfortTip, kind: 'comfort' },
          { db: IN_YELL_PEAK_DB, tip: yellTip, kind: 'yell' },
        ]}
      />
      <MeterRow
        label="Out"
        pct={outPct}
        hot={false}
        holdPct={holdPct}
        marks={
          targetDb != null ? [{ db: targetDb, tip: targetTip, kind: 'target' }] : []
        }
      />
      <div className="voice-level-meta">
        <span>{running ? `${stats.latency_ms.toFixed(0)} ms` : '—'}</span>
        <span>
          {running && stats.post_gain_peak > -90
            ? `peak ${stats.post_gain_peak.toFixed(0)} dB`
            : running
              ? `${stats.noise_reduction_db.toFixed(1)} dB NR`
              : '—'}
        </span>
      </div>
    </div>
  )
}

type Mark = { db: number; tip: string; kind: 'comfort' | 'yell' | 'target' }

function MeterRow({
  label,
  pct,
  hot,
  marks = [],
  holdPct = null,
}: {
  label: string
  pct: number
  hot: boolean
  marks?: Mark[]
  holdPct?: number | null
}) {
  return (
    <div className="voice-meter-row">
      <span className="voice-meter-label">{label}</span>
      <div className="meter-track">
        <motion.div
          className={['meter-fill', hot ? 'meter-fill-hot' : ''].filter(Boolean).join(' ')}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        />
        {holdPct != null ? (
          <span className="meter-hold" style={{ left: `${holdPct}%` }} aria-hidden />
        ) : null}
        {marks.map((m) => (
          <ChartTipAnchor
            key={m.kind}
            tip={m.tip}
            className={`meter-tick-hit meter-tick-hit-${m.kind}`}
            style={{ left: `${levelToPct(m.db)}%` }}
          >
            <span className={`meter-tick meter-tick-${m.kind}`} />
          </ChartTipAnchor>
        ))}
      </div>
    </div>
  )
}
