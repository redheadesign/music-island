// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIslandBassEffect, localHeartDuration } from '../../shared/ui/islandBassEffect'
import { IslandFeedback } from '../../shared/ui/PressFeedback'
import { PlaybackButton, ReactionButton } from './MusicControls'

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('island feedback commands', () => {
  it('dispatches immediately, keeps transport feedback centered and reaction feedback inside the button', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const animations: Keyframe[][] = []
    const cancel = vi.fn()
    vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(frames => { animations.push(frames as Keyframe[]); return { finished: new Promise(() => {}), cancel } as unknown as Animation })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 100 } as DOMRect)
    const host = document.createElement('div'); document.body.append(host)
    const root = createRoot(host), command = vi.fn()
    await act(async () => root.render(<IslandFeedback><PlaybackButton playing onClick={command} /><ReactionButton kind="like" active onClick={command} /></IslandFeedback>))
    Object.defineProperties(host.querySelector('.island-feedback')!, { clientWidth: { value: 400 }, clientHeight: { value: 100 } })
    const [pause, unlike] = host.querySelectorAll('button')
    await act(async () => { pause.click(); unlike.click() })
    expect(command).toHaveBeenCalledTimes(2)
    expect(animations).toHaveLength(1)
    const wave = host.querySelector<HTMLElement>('.island-feedback__wave')!
    const radius = Number.parseFloat(wave.style.width) / 2
    expect(Number.parseFloat(wave.style.left) + radius).toBeCloseTo(200)
    expect(Number.parseFloat(wave.style.top) + radius).toBeCloseTo(50)
    for (const frames of animations) { expect(frames[0].transform).toBe('scale(1)'); expect(frames.at(-1)).toEqual({ transform: 'scale(0)', opacity: 0 }) }
    await act(async () => { pause.click(); pause.click(); pause.click() })
    expect(cancel).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
    expect(cancel).toHaveBeenCalledTimes(4)
  })
})

it('uses a recent regular beat from this card and forgets it on pause', () => {
  const card = document.createElement('section')
  card.className = 'island-card'
  const layer = document.createElement('span'), button = document.createElement('button')
  card.append(layer, button)
  const clock = vi.spyOn(performance, 'now')
  const effect = createIslandBassEffect(layer)
  try {
    for (const time of [1000, 1500, 2000]) {
      clock.mockReturnValue(time)
      effect.update(0)
      effect.update(.65)
    }
    expect(layer.childElementCount).toBe(0)
    expect(Number(layer.style.getPropertyValue('--island-bass'))).toBe(.65)
    expect(localHeartDuration(button, 2150)).toBe(Math.round(350 / .49))
    expect(localHeartDuration(button, 3400)).toBeUndefined()
    expect(localHeartDuration(document.createElement('button'), 2150)).toBeUndefined()
    layer.dataset.playbackMotion = 'paused'
    effect.update(0)
    expect(localHeartDuration(button, 2150)).toBeUndefined()
  } finally { effect.dispose() }
})

it('accelerates both outward wave fronts without restarting them or moving the particles', () => {
  const layer = document.createElement('span')
  const animation = (animationName: string) => ({ animationName, playbackRate: 1 })
  const front = animation('island-glass-wave-out')
  const following = animation('island-glass-wave-out')
  const particle = animation('island-particle-fall')
  const getAnimations = vi.fn(() => [front, following, particle])
  Object.defineProperty(layer, 'getAnimations', { value: getAnimations })
  const effect = createIslandBassEffect(layer)
  effect.update(.8)
  expect(layer.style.getPropertyValue('--island-bass')).toBe('0.8')
  expect([front.playbackRate, following.playbackRate]).toEqual([3.4, 3.4].map(rate => expect.closeTo(rate)))
  expect(particle.playbackRate).toBe(1)
  effect.update(.1)
  expect([front.playbackRate, following.playbackRate]).toEqual([1.3, 1.3])
  effect.update(0)
  expect([front.playbackRate, following.playbackRate]).toEqual([1, 1])
  expect(getAnimations).toHaveBeenCalledTimes(1)
  expect(layer.style.getPropertyValue('--island-bass')).toBe('')
  effect.dispose()
})
