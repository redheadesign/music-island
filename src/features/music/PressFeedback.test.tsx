// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IslandFeedback } from '../../shared/ui/PressFeedback'
import { PlaybackButton, ReactionButton } from './MusicControls'

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('island feedback commands', () => {
  it('dispatches immediately, contracts on pause/unlike, and centers keyboard feedback', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addListener() {}, removeListener() {} })
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
    expect(animations).toHaveLength(2)
    const wave = host.querySelector<HTMLElement>('.island-feedback__wave')!
    const radius = Number.parseFloat(wave.style.width) / 2
    expect(Number.parseFloat(wave.style.left) + radius).toBeCloseTo(200)
    expect(Number.parseFloat(wave.style.top) + radius).toBeCloseTo(50)
    for (const frames of animations) { expect(frames[0].transform).toBe('scale(1)'); expect(frames.at(-1)).toEqual({ transform: 'scale(0)', opacity: 0 }) }
    await act(async () => { pause.click(); pause.click() })
    expect(cancel).toHaveBeenCalledTimes(1)
    await act(async () => root.unmount())
    expect(cancel).toHaveBeenCalledTimes(4)
  })
})
