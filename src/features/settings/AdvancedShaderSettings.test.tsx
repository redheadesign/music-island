// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { getDefaultConfig } from '../../app/tauriApi'
import { getUiPrefs, withUiPrefs } from '../../shared/lib/uiPrefs'
import { createIslandBassEffect } from '../../shared/ui/islandBassEffect'
import { IslandFeedback } from '../../shared/ui/PressFeedback'
import type { AppConfig } from '../../shared/lib/types'
import { AdvancedShaderSettings } from './AdvancedShaderSettings'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function Fixture({ initial, scope, playing }: {
  initial: AppConfig; scope: 'island' | 'dictation'; playing: boolean
}) {
  const [config, setConfig] = useState(initial)
  return <>
    <AdvancedShaderSettings config={config} onChange={setConfig} locale="en" scope={scope} />
    {scope === 'island' && <IslandFeedback particles playbackWave playbackMotion={playing} shaderTuning={getUiPrefs(config).islandShader} />}
  </>
}

async function openGroup(host: HTMLElement, name: string) {
  const details = [...host.querySelectorAll('details')].find(node => node.querySelector('summary')?.textContent.includes(name))!
  expect(details).toBeDefined()
  await act(async () => { details.open = true; details.dispatchEvent(new Event('toggle')) })
  return details
}

async function changeControl(group: HTMLElement, label: string, value: string) {
  const id = [...group.querySelectorAll('label')].find(node => node.textContent === label)!.htmlFor
  const control = [...group.querySelectorAll('input')].find(node => node.id === id)!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => {
    setter.call(control, value)
    control.dispatchEvent(new Event('input', { bubbles: true }))
    control.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

it('applies the editor to the live wave and particles, including zero gain, pause, resume and group reset', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.createElement('div'), root = createRoot(host)
  const initial = withUiPrefs(getDefaultConfig(), { interfaceTheme: 'glass' })
  const render = (playing: boolean) => <Fixture scope="island" initial={initial} playing={playing} />
  try {
    await act(async () => root.render(render(true)))
    const layer = host.querySelector<HTMLElement>('.island-feedback__ambient')!
    const bass = createIslandBassEffect(layer)
    const front = { animationName: 'island-glass-wave-out', playbackRate: 1, playState: 'running' }
    Object.defineProperty(layer, 'getAnimations', { value: () => [front] })
    bass.update(.8)
    expect(front.playbackRate).toBeGreaterThan(1)
    const wave = await openGroup(host, 'Music wave')
    await changeControl(wave, 'Bass response', '0')
    bass.update(.8)
    expect(layer.dataset.bassGain).toBe('0')
    expect(front.playbackRate).toBe(1)
    expect(layer.style.getPropertyValue('--island-wave-drive')).toBe('')

    const field = await openGroup(host, 'Falling particles')
    const first = layer.querySelector('.island-particles i')
    await changeControl(field, 'Count', '14')
    await changeControl(field, 'Color', '#44aaff')
    expect(layer.querySelectorAll('.island-particles i')).toHaveLength(14)
    expect(layer.querySelector('.island-particles i')).toBe(first)
    expect(layer.style.getPropertyValue('--island-particle-ink')).toBe('#44aaff')
    await act(async () => wave.querySelector('button')!.click())
    await act(async () => root.render(render(false)))
    bass.update(.8)
    expect(layer.dataset.playbackMotion).toBe('paused')
    expect(front.playbackRate).toBe(1)
    expect(layer.style.getPropertyValue('--island-wave-drive')).toBe('')
    await act(async () => root.render(render(true)))
    bass.update(.8)
    expect(front.playbackRate).toBeGreaterThan(1)
    expect(layer.querySelectorAll('.island-particles i')).toHaveLength(14)
    await act(async () => [...field.querySelectorAll('button')].find(node => node.textContent === 'Reset group')!.click())
    expect(layer.querySelectorAll('.island-particles i')).toHaveLength(9)
    expect(layer.style.getPropertyValue('--island-particle-ink')).toBe('')
    bass.dispose()
  } finally { await act(async () => root.unmount()) }
})

it('limits the dictation editor to controls used by the selected artwork and material', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.createElement('div'), root = createRoot(host)
  const render = (theme: 'pixels' | 'wave' | 'classic', materialTheme: 'glass' | 'classic') => {
    const initial = withUiPrefs(getDefaultConfig(), {
      dictationAppearance: { theme, materialTheme, palette: 'accent', chromatic: false, shaderTuning: { amplitude: .4 } },
    })
    return <Fixture key={theme + materialTheme} scope="dictation" initial={initial} playing />
  }
  try {
    await act(async () => root.render(render('wave', 'classic')))
    expect(host.textContent).toContain('Capsule lighting')
    const wave = await openGroup(host, 'Dictation waves')
    expect(wave.textContent).toContain('Custom')
    expect(wave.querySelector('input[step="0.01"]')?.getAttribute('value')).toBe('0.4')
    expect(host.textContent).toContain('Processing particles')
    await act(async () => root.render(render('pixels', 'glass')))
    expect(host.textContent).toContain('Fox')
    expect(host.textContent).not.toContain('Processing particles')
    expect(host.textContent).not.toContain('Capsule lighting')
    await act(async () => root.render(render('classic', 'glass')))
    expect(host.textContent).toBe('')
  } finally { await act(async () => root.unmount()) }
})
