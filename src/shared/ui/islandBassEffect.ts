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
  let drive = 0
  let lastSampleAt: number | undefined
  let appliedDrive = 0
  let fronts: Animation[] = []
  const card = layer.closest<HTMLElement>('.island-card')
  let lastInterval = 0
  let lastBeatAt = -Infinity

  function clear() {
    layer.style.removeProperty('--island-wave-drive')
    drive = 0
    appliedDrive = 0
    lastSampleAt = undefined
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
    const now = performance.now()
    const seconds = lastSampleAt === undefined ? .05 : Math.min(.1, Math.max(0, now - lastSampleAt) / 1000)
    lastSampleAt = now
    // Butterchurn AudioLevels (MIT): use different attack and release rates,
    // corrected for elapsed time rather than assuming a fixed frame cadence.
    const retention = (level > drive ? .85 : .93) ** (30 * seconds)
    drive = drive * retention + level * (1 - retention)
    const gain = Number(layer.dataset.bassGain ?? 1)
    const next = Math.round(drive * gain * 500) / 500
    const needsFronts = next > 0 && (!fronts.length || fronts.some(front => front.playState === 'idle'))
    if (next !== appliedDrive || needsFronts) {
      if (next > 0) layer.style.setProperty('--island-wave-drive', String(next))
      else layer.style.removeProperty('--island-wave-drive')
      if (needsFronts) {
        fronts = (layer.getAnimations?.({ subtree: true }) ?? []).filter(
          animation => 'animationName' in animation && animation.animationName === 'island-glass-wave-out',
        )
      }
      // Keep the running phase of each ring, including after CSS recreated its pseudo-elements.
      for (const front of fronts) front.playbackRate = 1 + next * .14
      appliedDrive = next
    }
    const rise = level - previous
    previous = level
    if (level < BEAT_TRIGGER || rise < MIN_RISE) return
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
