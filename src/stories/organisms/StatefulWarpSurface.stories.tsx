import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { StatefulWarpSurface } from '../../shared/ui/StatefulWarpSurface'
import { WarpSurfaceProvider } from '../../shared/ui/WarpSurface'
import { Button } from '../../shared/ui/SettingsControls'
import type { InterfaceScene } from '../../shared/lib/interfaceTheme'

function MaterialState({ light = false, reducedMotion = false, scene, sceneHeight = 256 }: {
  light?: boolean
  reducedMotion?: boolean
  scene?: InterfaceScene
  sceneHeight?: number
}) {
  const [running, setRunning] = useState(true)
  const colorScheme = light ? 'light' : 'dark'
  return <div className="settings-panel" data-color-scheme={colorScheme} data-interface-theme={scene ? 'glass' : 'classic'} data-reduced-motion={reducedMotion || undefined} style={{ padding: 24, background: 'var(--surface-canvas)' }}>
    <Button aria-pressed={running} onClick={() => setRunning(value => !value)}>Включено</Button>
    <WarpSurfaceProvider scene={scene} colorScheme={colorScheme}><div style={{ position: 'relative', height: sceneHeight, marginTop: 16, borderRadius: 24, overflow: 'hidden' }}>
      <StatefulWarpSurface running={running} reducedMotion={reducedMotion} />
    </div></WarpSurfaceProvider>
  </div>
}
const meta = { title: 'Organisms/StatefulWarpSurface', component: MaterialState, parameters: { workshop: { width: 720 } } } satisfies Meta<typeof MaterialState>
export default meta
type Story = StoryObj<typeof meta>
export const Toggle: Story = { name: 'Полный цвет → приглушение → полный цвет', play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  await waitFor(() => expect(canvasElement.querySelector('canvas')).toBeTruthy())
  const renderer = canvasElement.querySelector('canvas')
  const shader = canvasElement.querySelector('.stateful-warp-surface__shader')!
  const speed = () => canvasElement.querySelector('[data-speed]')?.getAttribute('data-speed')
  await expect(getComputedStyle(shader).opacity).toBe('1')
  await expect(speed()).toBe('1.1625')
  await userEvent.click(canvas.getByRole('button', { name: 'Включено' }))
  await waitFor(() => expect(getComputedStyle(shader).opacity).toBe('0.14'))
  await expect(speed()).toBe('0.225')
  await userEvent.click(canvas.getByRole('button', { name: 'Включено' }))
  await waitFor(() => expect(getComputedStyle(shader).opacity).toBe('1'))
  await expect(speed()).toBe('1.1625')
  await expect(canvasElement.querySelector('canvas')).toBe(renderer)
} }
export const Light: Story = { ...Toggle, name: 'Светлая тема · те же состояния', args: { light: true } }
export const ReducedMotion: Story = { name: 'Без движения · цвет сохранён', args: { reducedMotion: true }, play: async ({ canvasElement }) => {
  await expect(canvasElement.querySelector('[data-speed]')).toHaveAttribute('data-speed', '0')
  await expect(getComputedStyle(canvasElement.querySelector('.stateful-warp-surface__shader')!).opacity).toBe('1')
} }
export const GlassManta: Story = { name: 'Стекло · скаты в движении', args: { scene: 'manta' }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement)
  const renderer = await waitFor(() => paintedScene(canvasElement, 'manta'))
  await userEvent.click(canvas.getByRole('button', { name: 'Включено' }))
  await expect(canvasElement.querySelector('[data-ascii-scene="manta"]')).toBe(renderer)
  await expect(canvasElement.querySelector('[data-speed]')).toHaveAttribute('data-speed', '0.225')
} }
export const GlassFox: Story = { name: 'Стекло · лисы без движения', args: { scene: 'fox', light: true, reducedMotion: true }, play: async ({ canvasElement }) => {
  await waitFor(() => paintedScene(canvasElement, 'fox'))
  await expect(canvasElement.querySelector('[data-speed]')).toHaveAttribute('data-speed', '0')
} }
export const GlassFoxCompact: Story = {
  name: 'Стекло · лисы в компактном превью',
  args: { scene: 'fox', sceneHeight: 160 },
  parameters: { workshop: { width: 416 } },
  play: async ({ canvasElement }) => { await waitFor(() => paintedScene(canvasElement, 'fox')) },
}

function paintedScene(canvasElement: HTMLElement, scene: InterfaceScene) {
  const canvas = canvasElement.querySelector<HTMLCanvasElement>(`canvas[data-ascii-scene="${scene}"]`)
  const pixels = canvas?.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
  expect(pixels?.some((value, index) => index % 4 === 3 && value > 0)).toBe(true)
  return canvas
}
