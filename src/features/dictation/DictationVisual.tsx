import { memo, type CSSProperties } from 'react'
import { AnimatePresence, motion as animated } from 'framer-motion'
import { Check, LoaderCircle, Mic, X } from '../../shared/ui/SettingsIcons'
import { dictationArtworkDefaults, dictationPaletteColors, type DictationAppearance } from '../../shared/lib/dictationAppearance'
import { useDictationMotion } from './useDictationMotion'
import { DictationCloudSurface } from './DictationCloudSurface'
import { dictationFoxPose } from './dictationFoxPose'

type Pixel = [number, number, number?, number?]
const faces = {
  neutral: ['01110', '11111', '11111', '11111', '01110'],
  happy: ['01110', '11011', '10001', '00000', '00000'],
  wink: ['00000', '00000', '11111', '00000', '00000'],
  curious: ['01110', '11011', '10001', '11011', '01110'],
  love: ['01010', '11111', '11111', '01110', '00100'],
} as const
const ears = ['0010000', '0011000', '0111000', '0111100', '0111100', '1111110', '1111110', '1111111', '1111111']
const Glyph = memo(function Glyph({ rows, x, y, className }: { rows: readonly string[]; x: number; y: number; className?: string }) {
  return <g className={className}>{rows.flatMap((row, iy) => [...row].flatMap((cell, ix) => cell === '1' ? <rect key={`${iy}:${ix}`} x={x + ix * 2} y={y + iy * 2} width="1.7" height="1.7" rx=".25" /> : []))}</g>
})

function Arcade({ time, operationId, still }: { time: number; operationId: number; still: boolean }) {
  const selected = (['pong', 'starship', 'snake', 'breakout'] as const)[(Math.floor(time / 6) + operationId) % 4]
  const pixels: Pixel[] = []
  const bounce = (value: number, length: number) => length - Math.abs(value % (length * 2) - length)
  if (selected === 'pong') {
    const y = 11 + bounce(time * 9, 12)
    pixels.push([9, y - 3, 2, 7], [52, 23 - (y - 11), 2, 7], [15 + bounce(time * 20, 32), y, 2, 2])
    for (let y = 12; y < 30; y += 4) pixels.push([31, y, 1, 2])
  } else if (selected === 'snake') {
    const path: [number, number][] = []
    for (let x = 10; x <= 50; x += 3) path.push([x, 12])
    for (let y = 15; y <= 27; y += 3) path.push([50, y])
    for (let x = 47; x >= 10; x -= 3) path.push([x, 27])
    for (let y = 24; y >= 15; y -= 3) path.push([10, y])
    const head = Math.floor(time * 12) % path.length
    for (let i = 0; i < 9; i++) pixels.push([...path[(head - i + path.length) % path.length], 2.5, 2.5])
    pixels.push([34, 20, 2, 2])
  } else if (selected === 'starship') {
    const x = 12 + bounce(time * 10, 34)
    pixels.push([x, 26, 8, 2], [x + 2, 24, 4, 2], [x + 3, 22, 2, 2], [x + 3, 22 - (time * 18 % 12), 1, 3])
    for (let i = 0; i < 5; i++) pixels.push([9 + i * 10, 11 + (time * 8 + i * 3) % 17, 1, 1])
    for (let i = 0; i < 3; i++) pixels.push([12 + i * 16, 12, 6, 3])
  } else {
    const count = 5 - Math.floor(time * 1.5) % 5
    for (let i = 0; i < count; i++) pixels.push([10 + i * 9, 12, 7, 3])
    const x = 14 + bounce(time * 18, 32)
    pixels.push([x - 5, 28, 12, 2], [x, 16 + bounce(time * 12, 9), 2, 2])
  }
  const cells = pixels.map(([x, y, width = 2, height = 2], i) => <rect key={i} x={x} y={y} width={width} height={height} rx=".3" />)
  return still ? <g data-game={selected}>{cells}</g> : <AnimatePresence initial={false}>
    <animated.g key={selected} data-game={selected} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>{cells}</animated.g>
  </AnimatePresence>
}

export function DictationVisual({ appearance, phase, levels, still = false, active = true, demo = false, operationId = 0 }: {
  appearance: DictationAppearance; phase: string; levels: number[]; still?: boolean; active?: boolean; demo?: boolean; operationId?: number
}) {
  const recording = phase === 'recording' || phase === 'streaming'
  const working = phase === 'transcribing' || phase === 'processing'
  const terminal = ['completed', 'error', 'cancelled'].includes(phase)
  const level = Math.max(0, ...levels.filter(Number.isFinite).map(value => Math.min(1, Math.max(0, value))))
  const animate = !terminal && appearance.theme === 'pixels'
  const motion = useDictationMotion(active && animate, still, recording ? level : 0, demo && recording)
  const time = motion.time
  const style = { '--dictation-ink': dictationPaletteColors[appearance.palette], '--dictation-brightness': .4 + dictationArtworkDefaults.brightness * .006 } as CSSProperties
  const Icon = phase === 'completed' ? Check : terminal ? X : recording ? Mic : LoaderCircle
  if (appearance.theme === 'wave') return <DictationCloudSurface appearance={appearance} phase={phase} levels={levels} still={still} active={active} demo={demo} />
  if (appearance.theme === 'classic') {
    return <Icon size={17} className={working || phase === 'preparing' ? 'dictation-overlay__spinner' : 'dictation-visual__result'} aria-hidden="true" />
  }
  const pose = dictationFoxPose(time, motion.level, still)
  const emotion = pose.mood, blink = pose.blink
  const voice = recording ? Math.min(1, Math.max(0, (motion.level - .03) / .2)) : 0
  const state = working ? 'arcade' : terminal ? phase : 'face'
  const artwork = working ? <g transform="translate(0 -4.5)"><Arcade time={time} operationId={operationId} still={still} /></g> : terminal ?
    <g transform="translate(0 -4.5)"><Glyph rows={phase === 'completed' ? ['00000001', '00000011', '10000110', '11001100', '01111000', '00110000'] : ['10001', '01010', '00100', '01010', '10001']} x={phase === 'completed' ? 24 : 27} y={15} /></g> : <>
    <g className="dictation-pixel-ears" transform={`translate(${pose.x*.35} ${pose.y}) rotate(${pose.tilt} 32 24)`}>
      <g transform={`rotate(${pose.leftEar} 23 16)`}><Glyph rows={ears} x={11} y={-1} /></g>
      <g transform={`rotate(${pose.rightEar} 41 16)`}><g transform="translate(64 0) scale(-1 1)"><Glyph rows={ears} x={11} y={-1} /></g></g>
    </g>
      <g transform="translate(0 6)" className="dictation-pixel-expression" data-visual="equalizer" opacity={voice}>{Array.from({ length: 9 }, (_, i) => {
        const height = 2 + motion.level * (7 - Math.abs(i - 4) * .6) * (1 + Math.sin(time * 9 + i) * .25) * 2
        return <rect key={i} x={11 + i * 5} y={23 - height / 2} width="3" height={height} rx=".4" />
      })}</g><g className="dictation-pixel-expression" opacity={1 - voice} transform={`translate(${pose.x} ${pose.y+6}) rotate(${pose.tilt} 32 24) translate(32 24) scale(${pose.scale}) translate(-32 -24)`}>
        <Glyph rows={blink ? faces.wink : faces[emotion === 'wink' ? 'neutral' : emotion]} x={17} y={16} />
        <Glyph rows={blink || emotion === 'wink' ? faces.wink : faces[emotion]} x={37} y={16} />
      </g></>
  // One coordinate system and retained layers avoid a resize/cut at each phase.
  // stiffness400/damping40 are the source recorder's .314s critical spring.
  return <svg className="dictation-visual dictation-visual--pixels" style={style} viewBox="0 -5 64 43" aria-hidden="true" data-character="fox" data-emotion={emotion}>
    {still ? <g data-artwork={state}>{artwork}</g> : <AnimatePresence initial={false}>
      <animated.g key={state} data-artwork={state} initial={{ opacity: 0, scale: .88 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .88 }} transition={{ type: 'spring', stiffness: 400, damping: 40 }} style={{ transformOrigin: '32px 16.5px' }}>{artwork}</animated.g>
    </AnimatePresence>}
  </svg>
}
