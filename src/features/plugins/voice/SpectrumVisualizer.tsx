import { useEffect, useRef } from 'react'

const BANDS = 64
const SAMPLE_RATE = 48000
const NYQUIST = SAMPLE_RATE / 2
const FREQ_MIN = 20
const FREQ_MAX = NYQUIST
const RISE = 0.22
const FALL = 0.1

const FREQ_MARKS = [50, 200, 500, 1000, 2000, 5000, 10000] as const

const logBandFreqs = Array.from({ length: BANDS }, (_, i) => {
  const t = i / (BANDS - 1)
  return FREQ_MIN * Math.pow(FREQ_MAX / FREQ_MIN, t)
})

function freqToX(freq: number, width: number) {
  if (freq <= FREQ_MIN) return 0
  if (freq >= FREQ_MAX) return width
  const t = Math.log(freq / FREQ_MIN) / Math.log(FREQ_MAX / FREQ_MIN)
  return t * width
}

function formatHz(f: number) {
  return f >= 1000 ? `${f / 1000}k` : `${f}`
}

type Props = {
  spectrumIn: number[]
  spectrumOut: number[]
  active?: boolean
}

/** Log-frequency spectrum (in = gray, out = accent). */
export function SpectrumVisualizer({ spectrumIn, spectrumOut, active = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const displayIn = useRef(new Float32Array(BANDS))
  const displayOut = useRef(new Float32Array(BANDS))
  const targetIn = useRef(new Float32Array(BANDS))
  const targetOut = useRef(new Float32Array(BANDS))
  const raf = useRef<number | null>(null)

  useEffect(() => {
    const tin = targetIn.current
    const tout = targetOut.current
    for (let i = 0; i < BANDS; i++) {
      tin[i] = active ? (spectrumIn[i] ?? 0) : 0
      tout[i] = active ? (spectrumOut[i] ?? 0) : 0
    }
  }, [spectrumIn, spectrumOut, active])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let gradient: CanvasGradient | null = null
    let gradH = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const tick = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight

      for (let i = 0; i < BANDS; i++) {
        const din = displayIn.current
        const dout = displayOut.current
        const speedIn = targetIn.current[i] > din[i] ? RISE : FALL
        const speedOut = targetOut.current[i] > dout[i] ? RISE : FALL
        din[i] += (targetIn.current[i] - din[i]) * speedIn
        dout[i] += (targetOut.current[i] - dout[i]) * speedOut
      }

      ctx.clearRect(0, 0, width, height)
      if (!gradient || gradH !== height) {
        gradH = height
        gradient = ctx.createLinearGradient(0, height, 0, 0)
        gradient.addColorStop(0, '#c8f062')
        gradient.addColorStop(0.55, '#f0b429')
        gradient.addColorStop(1, '#ff6b6b')
      }

      for (let i = 0; i < BANDS; i++) {
        const freqLo = i === 0 ? FREQ_MIN : logBandFreqs[i - 1]
        const freqHi = i === BANDS - 1 ? FREQ_MAX : logBandFreqs[i]
        const xLo = freqToX(freqLo, width)
        const xHi = freqToX(freqHi, width)
        const barW = Math.max(xHi - xLo - 1, 1)
        const vin = displayIn.current[i]
        if (vin >= 0.005) {
          const bh = vin * height
          ctx.fillStyle = 'rgba(167, 174, 166, 0.45)'
          roundBar(ctx, xLo, height - bh, barW, bh)
        }
        const vout = displayOut.current[i]
        if (vout >= 0.005) {
          const bh = vout * height
          ctx.fillStyle = gradient
          roundBar(ctx, xLo, height - bh, barW, bh)
        }
      }

      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)

    return () => {
      ro.disconnect()
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [])

  return (
    <div className="spectrum-wrap">
      <canvas ref={canvasRef} className="spectrum-canvas" aria-hidden />
      <div className="spectrum-freq-row" aria-hidden>
        {FREQ_MARKS.map((f) => (
          <span
            key={f}
            className="spectrum-freq-mark"
            style={{ left: `${(freqToX(f, 1000) / 1000) * 100}%` }}
          >
            {formatHz(f)}
          </span>
        ))}
      </div>
    </div>
  )
}

function roundBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, [1.5, 1.5, 0, 0])
  else ctx.rect(x, y, w, h)
  ctx.fill()
}
