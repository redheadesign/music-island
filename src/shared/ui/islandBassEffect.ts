const BEAT_TRIGGER = .22
const MIN_RISE = .1
const BEAT_COOLDOWN_MS = 240
const beatByCard = new WeakMap<HTMLElement, { at: number; interval: number }>()

/** Time the second peak of the 2-beat gesture to a recent, regular bass attack. */
export function localHeartDuration(button: HTMLElement, now = performance.now()): number | undefined {
  const card = button.closest<HTMLElement>('.island-card')
  const beat = card && beatByCard.get(card)
  if (!beat || now - beat.at > beat.interval * 2) return
  let nextPeak = beat.interval - (now - beat.at) % beat.interval
  if (nextPeak < 170) nextPeak += beat.interval
  // Keep clicks responsive on slow or irregular tracks.
  if (nextPeak > 500) return
  return Math.round(nextPeak / .49)
}

/** Drive the two wave fronts and remember regular attacks for the local heart gesture. */
export function createIslandBassEffect(layer: HTMLElement) {
  let previous = 0
  let fronts: Animation[] = []
  const card = layer.closest<HTMLElement>('.island-card')
  let lastInterval = 0
  let lastBeatAt = -Infinity

  function clear() {
    layer.style.removeProperty('--island-bass')
    previous = 0
    for (const front of fronts) front.playbackRate = 1
    fronts = []
    lastBeatAt = -Infinity
    lastInterval = 0
    if (card) beatByCard.delete(card)
  }

  function update(level: number) {
    if (layer.dataset.playbackMotion === 'paused') {
      clear()
      return
    }
    const rise = level - previous
    if (rise === 0) return
    if (level > 0) layer.style.setProperty('--island-bass', String(level))
    else layer.style.removeProperty('--island-bass')
    // Change playback rate without restarting or shrinking the outward-moving fronts.
    // System motion preferences and the pause fade own the CSS animations' lifetimes.
    if (!fronts.length && level > 0) {
      fronts = (layer.getAnimations?.({ subtree: true }) ?? []).filter(
        animation => 'animationName' in animation && animation.animationName === 'island-glass-wave-out',
      )
    }
    for (const front of fronts) front.playbackRate = 1 + level * 3
    previous = level
    if (level < BEAT_TRIGGER || rise < MIN_RISE) return
    const now = performance.now()
    if (now - lastBeatAt < BEAT_COOLDOWN_MS) return
    const interval = now - lastBeatAt
    if (card) {
      if (interval >= 280 && interval <= 950 && Math.abs(interval - lastInterval) <= interval * .18) {
        beatByCard.set(card, { at: now, interval: (interval + lastInterval) / 2 })
      } else {
        beatByCard.delete(card)
      }
    }
    lastInterval = interval
    lastBeatAt = now
  }

  return {
    layer,
    update,
    dispose: clear,
  }
}
