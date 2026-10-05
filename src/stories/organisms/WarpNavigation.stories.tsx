import { useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { WarpMaterial } from '../../shared/ui/WarpMaterial'
import { WARP_SPEED } from '../../shared/ui/warpPreset'
import { WarpSurface, WarpSurfaceProvider } from '../../shared/ui/WarpSurface'
import { Button } from '../../shared/ui/SettingsControls'

const pages = ['Внешний вид', 'Панель задач', 'Лимиты', 'Better Voice']
const heights = [272, 216, 380, 256]
const PassThrough = ({ children }: { children: ReactNode }) => children

/** Same shader/geometry, changing only ownership. Numbers are click-to-next-frame,
 * not GPU timings; run both variants in the same browser, with no background work. */
function NavigationProfile({ persistent = true }: { persistent?: boolean }) {
  const [page, setPage] = useState(0)
  const [visible, setVisible] = useState(true)
  const [running, setRunning] = useState(false)
  const [measurements, setMeasurements] = useState<{ page: string; ms: number; newCanvas: boolean }[]>([])
  const stage = useRef<HTMLDivElement>(null)
  const Provider = persistent ? WarpSurfaceProvider : PassThrough
  const Field = persistent ? WarpSurface : WarpMaterial
  const measure = async (next: number) => {
    const previous = stage.current?.querySelector('canvas')
    const start = performance.now()
    flushSync(() => setPage(next))
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const elapsed = performance.now() - start
    setMeasurements(rows => [...rows, { page: pages[next], ms: Math.round(elapsed * 10) / 10, newCanvas: previous !== stage.current?.querySelector('canvas') }])
  }
  return <div className="auxiliary-ui" style={{ padding: 24, background: 'var(--surface-canvas)', color: 'var(--fg-primary)' }}>
    <div className="ui-action-row"><Button disabled={running} onClick={async () => {
      setRunning(true); setVisible(true); setMeasurements([])
      for (let i = 1; i <= 12; i++) await measure(i % 4)
      setRunning(false)
    }}>Измерить 12 переходов</Button><Button disabled={running} onClick={() => setVisible(value => !value)}>{visible ? 'Скрыть превью' : 'Показать превью'}</Button></div>
    <div className="ui-action-row">{pages.map((label, index) => <Button key={label} disabled={running} onClick={() => void measure(index)}>{label}</Button>)}</div>
    <div ref={stage}><Provider><div className="settings-preview" style={{ height: heights[page] }}><Field key={page} active={visible} speed={page === 3 ? WARP_SPEED.running : WARP_SPEED.resting} /><span style={{ position: 'relative', padding: 24 }}>{pages[page]}</span></div></Provider></div>
    <pre style={{ whiteSpace: 'pre-wrap' }} aria-label="Результат профиля">{JSON.stringify({ persistent, transitions: measurements.length, newCanvases: measurements.filter(row => row.newCanvas).length, measurements }, null, 2)}</pre>
  </div>
}
const meta = { title: 'Organisms/WarpNavigation', component: NavigationProfile, parameters: { workshop: { width: 720 } } } satisfies Meta<typeof NavigationProfile>
export default meta
type Story = StoryObj<typeof meta>
export const Persistent: Story = { name: 'Постоянный canvas · профиль переходов' }
export const RemountBaseline: Story = { name: 'Исходное пересоздание · профиль переходов', args: { persistent: false } }
