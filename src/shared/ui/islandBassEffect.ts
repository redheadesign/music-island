const MIN_SIGNAL = .075
const MIN_RISE = .03
const BASELINE_STEP = .14
const BURST_COOLDOWN_MS = 240
const MAX_PARTICLES = 18

/** Applies the real playback level and releases a bounded spray on strong attacks. */
export function createIslandBassEffect(layer: HTMLElement) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce), (forced-colors: active)')
  const active = new Map<Animation, HTMLElement>()
  let previous = 0
  let baseline = 0
  let lastBurstAt = -Infinity
  let sequence = 0

  function clear() {
    layer.style.removeProperty('--island-bass')
    for (const [animation, particle] of active) {
      animation.cancel()
      particle.remove()
    }
    active.clear()
    previous = 0
    baseline = 0
    lastBurstAt = -Infinity
  }

  function onMediaChange() {
    if (media.matches) clear()
  }
  media.addEventListener('change', onMediaChange)

  function burst(strength: number) {
    const count = Math.min(5 + Math.round(strength * 4), MAX_PARTICLES - active.size)
    if (!count || !layer.animate) return
    sequence += 1
    for (let index = 0; index < count; index += 1) {
      const variation = ((index * 37 + sequence * 23) % 101) / 101
      const particle = layer.ownerDocument.createElement('i')
      particle.className = 'island-bass-particle'
      particle.style.setProperty('--bass-particle-x', `${5 + (index + .2 + variation * .6) / count * 90}%`)
      particle.style.setProperty('--bass-particle-y', `${3 + variation * 8}px`)
      particle.style.setProperty('--bass-particle-size', `${3.5 + strength * 2.6 + variation * 1.9}px`)
      const drift = (variation - .5) * (22 + strength * 28)
      const fall = 58 + strength * 55 + variation * 24
      layer.append(particle)
      const animation = particle.animate([
        { opacity: 0, transform: 'translate(0, 0) scale(.65)' },
        { opacity: 1, transform: `translate(${drift * .16}px, ${fall * .11}px) scale(1)`, offset: .14 },
        { opacity: 0, transform: `translate(${drift}px, ${fall}px) scale(.35)` },
      ], {
        duration: 335 - strength * 62 + variation * 85,
        delay: index * 3 + variation * 12,
        easing: 'cubic-bezier(.25, .5, .65, 1)',
      })
      active.set(animation, particle)
      const remove = () => {
        particle.remove()
        active.delete(animation)
      }
      void animation.finished.then(remove, remove)
    }
  }

  function update(level: number) {
    if (layer.ownerDocument.hidden || media.matches || layer.dataset.playbackMotion === 'paused'
      || layer.closest('.reduced-motion, [data-reduced-motion="true"], [data-reduced-transparency="true"]')) {
      clear()
      return
    }
    const rise = level - previous
    if (rise !== 0) {
      if (level > 0) layer.style.setProperty('--island-bass', String(Math.min(1, Math.sqrt(level) * 1.8)))
      else layer.style.removeProperty('--island-bass')
    }
    previous = level
    const excess = level - baseline
    const threshold = Math.max(MIN_RISE, baseline * .24)
    baseline += excess * BASELINE_STEP
    if (level < MIN_SIGNAL || rise < MIN_RISE || excess < threshold) return
    const now = performance.now()
    if (now - lastBurstAt < BURST_COOLDOWN_MS) return
    lastBurstAt = now
    burst(Math.min(1, excess / .28))
  }

  return {
    layer,
    update,
    dispose() {
      media.removeEventListener('change', onMediaChange)
      clear()
    },
  }
}
