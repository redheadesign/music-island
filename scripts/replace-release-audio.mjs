// Copy the approved video stream bit-for-bit; replace audio only.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { releaseAudio } from './release-audio.mjs'
const require = createRequire(import.meta.url)
const ffmpeg = process.env.FFMPEG ?? require('@ffmpeg-installer/ffmpeg').path
const classic = JSON.parse(readFileSync('src/stories/release/release3Motion.config.json','utf8'))
const concepts = JSON.parse(readFileSync('src/stories/release/release3Concepts.config.json','utf8'))
const archive = 'release/media-3.0/archive-2026-09-23-before-stock-audio'
for (const id of ['ru','en','continuous-ru','rhythm-ru']) {
  const concept = id.includes('-') ? id.split('-')[0] : 'classic'
  const duration = (concept === 'classic' ? classic : concepts[concept]).cuts.at(-1)
  const audio = releaseAudio(duration, concept)
  const file = `music-island-3.0-${id}.mp4`
  const result = spawnSync(ffmpeg, ['-hide_banner','-loglevel','warning','-y','-i',`${archive}/${file}`,...audio.input,'-t',String(duration),'-c:v','copy','-filter_complex_threads','1',...audio.output,'-movflags','+faststart',`release/media-3.0/${file}`],{stdio:'inherit'})
  if(result.status !== 0) throw new Error(`Audio replacement failed: ${id}`)
  console.log(`Updated audio only: ${id}`)
}
