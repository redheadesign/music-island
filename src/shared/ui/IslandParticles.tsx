import type { CSSProperties } from 'react'

// Negative delays start the field in motion. Different lifetimes stagger
// subsequent arrivals without a timer, random layout or render loop.
const particles = [
  { x: 6, fall: 46, seconds: 7.7, phase: -1.8, size: 1.4 },
  { x: 15, fall: 67, seconds: 9.4, phase: -6.2, size: 2.1 },
  { x: 26, fall: 38, seconds: 7.3, phase: -4.5, size: 1.3 },
  { x: 35, fall: 79, seconds: 10.1, phase: -2.7, size: 1.8 },
  { x: 48, fall: 50, seconds: 8.8, phase: -7.3, size: 1.2 },
  { x: 59, fall: 64, seconds: 9.8, phase: -5, size: 1.6 },
  { x: 70, fall: 42, seconds: 7.9, phase: -.6, size: 1.2 },
  { x: 82, fall: 72, seconds: 10.7, phase: -8.1, size: 2 },
  { x: 94, fall: 56, seconds: 8.6, phase: -3.7, size: 1.5 },
] as const

// Extra lanes retain the original nine seeds and clock phases when density changes.
const particleStyles = Array.from({ length: 24 }, (_, index) => {
  const seed = particles[index % particles.length]
  const cycle = Math.floor(index / particles.length)
  const x = (seed.x + cycle * 17.5) % 100
  const { fall, size } = seed
  const seconds = seed.seconds + cycle * .8
  const phase = seed.phase - cycle * 1.3
  return {
    '--particle-x': `${x}%`, '--particle-fall': `${fall}px`,
    '--particle-time': `${seconds}s`, '--particle-delay': `${phase}s`, '--particle-size': `${size}px`,
  } as CSSProperties
})

export function IslandParticles({ count = 9 }: { count?: number }) {
  return <span className="island-particles" aria-hidden="true">
    {particleStyles.slice(0, count).map((style, index) => <i key={index} style={style} />)}
  </span>
}
