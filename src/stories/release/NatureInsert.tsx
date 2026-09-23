import { useEffect, useRef } from 'react'

const images = [1, 2, 3].map(n => new URL(`./assets/motion/nature-${n}.jpg`, import.meta.url).href)
const videos = [1, 2, 3].map(n => new URL(`./assets/motion/nature-${n}.mp4`, import.meta.url).href)

/** Paused video is explicitly sought by the workshop clock, never wall time. */
export function NatureInsert({ index, time, backdrop = false }: { index: number; time: number; backdrop?: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (video.current && video.current.readyState >= 1) video.current.currentTime = Math.min(3.96, Math.max(0, time))
  }, [time, index])
  const close = !backdrop ? Math.max(0, Math.min(1, (time - 3.45) / .55)) : 0
  const pull = close * close * (3 - 2 * close)
  const target = index === 1 ? { top: 660, side: 65, bottom: 300, radius: 30 } : index === 2 ? { top: 715, side: 65, bottom: 355, radius: 38 } : { top: 681, side: 81, bottom: 321, radius: 24 }
  return <div className={`nature-insert nature-insert--${index}${backdrop ? ' nature-backdrop' : ''}`} style={{ top: pull * target.top, left: pull * target.side, right: pull * target.side, bottom: pull * target.bottom, borderRadius: pull * target.radius }}>
    <img src={images[index - 1]} alt="" />
    <video key={index} ref={video} src={videos[index - 1]} poster={images[index - 1]} muted playsInline preload="auto" data-export-video data-frame-time={Math.min(3.96, Math.max(0, time))} />
    {!backdrop && <div className="nature-insert__type" style={{ opacity: 1 - pull }}><span>Music Island</span><h2>{index === 1 ? <>В своём<br />ритме</> : index === 2 ? <>Ваша мысль<br />звучит</> : <>Светлая<br />или тёмная</>}</h2></div>}
  </div>
}
