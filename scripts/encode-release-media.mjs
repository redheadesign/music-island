import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { releaseAudio } from './release-audio.mjs'
const timeline = JSON.parse(readFileSync(new URL('../src/stories/release/release3Motion.config.json', import.meta.url), 'utf8'))
const concepts = JSON.parse(readFileSync(new URL('../src/stories/release/release3Concepts.config.json', import.meta.url), 'utf8'))
const require = createRequire(import.meta.url)
const ffmpeg = process.env.FFMPEG ?? require('@ffmpeg-installer/ffmpeg').path
const output = 'release/media-3.0'
mkdirSync(output, { recursive: true })
const requested = process.argv.slice(2)
const allowed = ['en','ru','continuous-ru','rhythm-ru']
if (requested.some(value => !allowed.includes(value))) throw new Error(`Expected ${allowed.join(', ')}`)
for (const id of requested.length ? requested : ['en','ru']) {
  const locale = id.endsWith('en') ? 'en' : 'ru', concept = id.includes('-') ? id.split('-')[0] : 'classic'
  const active = concept === 'classic' ? timeline : concepts[concept]
  const duration = active.cuts.at(-1), frameCount = duration * timeline.fps
  const folder = `.local/release3-frames/${id}`
  const names = existsSync(folder) ? new Set(readdirSync(folder).filter(name => /^\d{5}\.png$/.test(name))) : new Set()
  if (names.size !== frameCount || Array.from({length:frameCount}, (_, i) => `${String(i).padStart(5,'0')}.png`).some(name => !names.has(name))) throw new Error(`Expected ${frameCount} consecutive frames for ${id}`)
  const audio = releaseAudio(duration,concept)
  const file = `${output}/music-island-3.0-${id}.mp4`
  const result = spawnSync(ffmpeg, ['-hide_banner','-y','-framerate',String(timeline.fps),'-i',`${folder}/%05d.png`,...audio.input,'-t',String(duration),'-frames:v',String(frameCount),'-c:v','libx264','-crf','18','-preset','medium','-threads','2','-filter_threads','1','-filter_complex_threads','1','-vf','scale=in_range=full:out_range=tv:out_color_matrix=bt709','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',...audio.output,file], { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`Encoding ${id} failed`)
}

