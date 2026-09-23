// Development-only verification of the exported files, including the QR after H.264.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import sharp from 'sharp'
import jsQR from 'jsqr'
const timeline = JSON.parse(readFileSync(new URL('../src/stories/release/release3Motion.config.json', import.meta.url), 'utf8'))
const concepts = JSON.parse(readFileSync(new URL('../src/stories/release/release3Concepts.config.json', import.meta.url), 'utf8'))
const require = createRequire(import.meta.url)
const ffmpeg = process.env.FFMPEG ?? require('@ffmpeg-installer/ffmpeg').path
const qa = '.local/release3-qa'
mkdirSync(qa, { recursive: true })
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const run = args => {
  const result = spawnSync(ffmpeg, ['-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(result.stderr || `FFmpeg exited ${result.status}`)
  return result.stderr
}
const images = []
const image = async (path, width, height) => {
  const meta = await sharp(path).metadata()
  if (meta.width !== width || meta.height !== height) throw new Error(`Unexpected image size: ${path}`)
  images.push({ path, width, height, bytes: statSync(path).size, sha256: hash(path) })
}
for (const name of ['01-island','02-taskbar','03-voice','04-usage','05-settings','06-dictation']) {
  await image(`release/media-3.0/masters/${name}.png`, 2880, 1800)
  await image(`docs/media/v3/${name}.webp`, 1440, 900)
}
for (const name of ['01-dictation','02-models','03-settings']) await image(`docs/releases/3.0/${name}.png`, 1080, 1350)
const videos = []
const allowed = ['en','ru','continuous-ru','rhythm-ru']
const requested = process.argv.slice(2)
if (requested.some(id => !allowed.includes(id))) throw new Error('Unknown film ID')
for (const id of requested.length ? requested : allowed) {
  const locale = id.endsWith('en') ? 'en' : 'ru'
  const active = id.includes('-') ? concepts[id.split('-')[0]] : timeline
  const duration = active.cuts.at(-1), frameCount = duration * timeline.fps
  const path = `release/media-3.0/music-island-3.0-${id}.mp4`
  const width = locale === 'en' ? 1920 : 1080, height = locale === 'en' ? 1080 : 1920
  const log = run(['-i',path,'-vf','blackdetect=d=0.08:pix_th=0.015:pic_th=0.98','-f','null','-'])
  writeFileSync(`${qa}/decode-${id}.log`, log)
  const parsedDuration = /Duration: (\d+):(\d+):([\d.]+)/.exec(log)
  const seconds = parsedDuration ? Number(parsedDuration[1]) * 3600 + Number(parsedDuration[2]) * 60 + Number(parsedDuration[3]) : 0
  const frames = [...log.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1]
  const audio = /Stream .* Audio:/.test(log)
  if (Math.abs(seconds - duration) > .04 || Number(frames) !== frameCount || !audio || !log.includes(`${width}x${height}`) || !/30 fps/.test(log) || !/Video: h264/.test(log) || /black_start:/.test(log)) throw new Error(`Video validation failed: ${locale}; see decode log`)
  const qrPath = `${qa}/qr-${id}.png`
  run(['-y','-ss',String(duration - 1),'-i',path,'-frames:v','1',qrPath])
  const rgba = await sharp(qrPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const qr = jsQR(new Uint8ClampedArray(rgba.data), rgba.info.width, rgba.info.height)
  if (qr?.data !== 'https://github.com/redheadesign/music-island') throw new Error(`Final QR is unreadable or incorrect: ${locale}`)
  let audioLevels
  if (audio) {
    if (!log.includes('Mixkit Stock Music Free License')) throw new Error('Licensed soundtrack provenance is missing')
    const levelLog = run(['-i',path,'-vn','-af','volumedetect','-f','null','-'])
    writeFileSync(`${qa}/audio-${id}.log`, levelLog)
    audioLevels = { meanDb: Number(/mean_volume: ([\d.-]+)/.exec(levelLog)?.[1]), peakDb: Number(/max_volume: ([\d.-]+)/.exec(levelLog)?.[1]) }
    if (!Number.isFinite(audioLevels.meanDb) || audioLevels.meanDb < -45 || audioLevels.peakDb >= 0) throw new Error('Audio is silent or clipping')
  }
  await image(`release/media-3.0/showreel-${id}-poster.png`,width,height)
  videos.push({ path,width,height,seconds,frames:Number(frames),fps:timeline.fps,audio,audioLevels,qr:qr.data,bytes:statSync(path).size,sha256:hash(path),decode:'passed',blackFrames:false })
}
const previous = requested.length && existsSync('release/media-3.0/manifest.json') ? JSON.parse(readFileSync('release/media-3.0/manifest.json','utf8')) : { images: [], videos: [] }
const retained = previous.videos.filter(old => !videos.some(current => current.path === old.path))
const retainedImages = previous.images.filter(old => !images.some(current => current.path === old.path))
const manifest = { images: [...retainedImages, ...images], videos: [...retained, ...videos], source:'Storybook production components with fictional fixtures; see docs/releases/3.0-media-sources.md' }
writeFileSync('release/media-3.0/manifest.json', JSON.stringify(manifest,null,2)+'\n')
writeFileSync(`${qa}/media.json`, JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify({images:images.length,videos},null,2))
