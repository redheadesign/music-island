import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ReleaseScene } from './ReleaseScene'
import { Release3NewScene } from './Release3Visuals'
import { saveReleaseImage, settleReleaseFrame } from './release3Export'
import './release.css'

type Feature = 'island' | 'taskbar' | 'voice' | 'usage' | 'settings' | 'dictation' | 'models'
function Gallery({ feature: initialFeature = 'dictation', format: initialFormat = 'readme' }: { feature?: Feature; format?: 'readme' | 'telegram' }) {
  const [feature, setFeature] = useState(initialFeature), [format, setFormat] = useState(initialFormat)
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('Ready')
  const root = useRef<HTMLDivElement>(null)
  const capture = async (nextFeature: Feature, nextFormat: 'readme' | 'telegram') => {
    flushSync(() => { setFeature(nextFeature); setFormat(nextFormat); setStatus(`${nextFormat} / ${nextFeature}`) })
    const scene = root.current!.querySelector<HTMLElement>('.release-scene')!
    await settleReleaseFrame(scene)
    // A hidden workshop tab may not decode the fox before the first snapshot.
    // Seek the real alpha video to a reproducible frame; never export an empty box.
    const video = scene.querySelector<HTMLVideoElement>('.voice-fox__video--active')
    if (video) {
      const waitForVideo = (event: 'loadeddata' | 'seeked') => new Promise<void>((resolve, reject) => {
        const done = () => { clearTimeout(timer); video.removeEventListener(event, done); resolve() }
        const timer = setTimeout(() => { video.removeEventListener(event, done); reject(new Error(`Fox frame unavailable: ${event}`)) }, 10000)
        video.addEventListener(event, done, { once: true })
      })
      if (video.readyState < 2) {
        const loaded = waitForVideo('loadeddata')
        video.preload = 'auto'; video.load()
        await loaded
      }
      video.pause()
      const sought = waitForVideo('seeked')
      video.currentTime = Math.min(1.2, video.duration / 2)
      await sought
    }
    await saveReleaseImage(scene, nextFormat, nextFeature)
  }
  const exportAll = async () => {
    setBusy(true)
    try {
      for (const item of ['island','taskbar','voice','usage','settings','dictation'] as const) await capture(item, 'readme')
      for (const item of ['dictation','models','settings'] as const) await capture(item, 'telegram')
      setStatus('Saved: 6 README images + 3 Telegram images')
    } catch (error) { setStatus(String(error)) } finally { setBusy(false) }
  }
  return <><div ref={root} className="release3-gallery">{feature === 'dictation' || feature === 'models' ? <Release3NewScene feature={feature} format={format} /> : <ReleaseScene feature={feature} format={format} showExport={false} />}</div><nav className="release3-controls" aria-label="Release export"><select aria-label="Feature" value={feature} disabled={busy} onChange={event => setFeature(event.target.value as Feature)}>{['dictation','models','island','taskbar','voice','usage','settings'].map(value => <option key={value}>{value}</option>)}</select><select aria-label="Format" value={format} disabled={busy} onChange={event => setFormat(event.target.value as typeof format)}><option value="readme">README · EN</option><option value="telegram">Telegram · RU</option></select><button disabled={busy} onClick={() => void exportAll()}>Export all 9 images</button><output aria-live="polite">{status}</output></nav></>
}
const meta = { title: 'Screens/Release3', component: Gallery, parameters: { layout: 'fullscreen', workshop: { bare: true } } } satisfies Meta<typeof Gallery>
export default meta
type Story = StoryObj<typeof meta>
export const Dictation: Story = { name: 'Диктовка · README' }
export const Models: Story = { name: 'Модели · Telegram', args: { feature: 'models', format: 'telegram' } }
export const Settings: Story = { name: 'Настройки · README', args: { feature: 'settings' } }
export const Telegram: Story = { name: 'Диктовка · Telegram', args: { feature: 'dictation', format: 'telegram' } }
