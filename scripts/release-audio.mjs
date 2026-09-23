// Licensed recordings for synchronized promotional videos only.
// Raw audio stays in ignored release/ and must not be distributed with source.
import { existsSync } from 'node:fs'
export const stockAudio = {
  title: 'Tech House vibes', artist: 'Alejandro Magaña (A. M.)',
  license: 'Mixkit Stock Music Free License',
  directory: 'release/media-3.0/audio/stock',
  files: ['tech-house-vibes.mp3', 'ocean.wav', 'crickets.wav'],
}
export function releaseAudio(duration, concept) {
  const paths = stockAudio.files.map(file => `${stockAudio.directory}/${file}`)
  for (const path of paths) if (!existsSync(path)) throw new Error(`Missing licensed audio: ${path}; see docs/releases/3.0-media-sources.md`)
  // Two seconds of real ambience lead into the same unaltered musical excerpt.
  // No generative music, synthesized effects, tempo changes or music-only remix.
  const natureGain = concept === 'rhythm'
    ? "if(lt(t,4),0.18,if(between(t,9,13),0.07,if(between(t,21,25),0.06,0.012)))"
    : 'if(lt(t,4),0.18,0.008)'
  const graph = [
    `[1:a]atrim=start=8:duration=${duration - 2},asetpts=PTS-STARTPTS,loudnorm=I=-18:TP=-2:LRA=8,afade=t=in:d=1.2,afade=t=out:st=${duration - 4}:d=2,adelay=2000|2000[music]`,
    `[2:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,highpass=f=80,volume='${natureGain}':eval=frame,afade=t=in:d=0.3,afade=t=out:st=${duration - 2}:d=2[sea]`,
    '[3:a]atrim=duration=4,asetpts=PTS-STARTPTS,volume=0.14,afade=t=in:d=0.2,afade=t=out:st=2:d=2[insects]',
    '[music][sea][insects]amix=inputs=3:duration=longest:dropout_transition=0,volume=3,alimiter=limit=0.89:level=false[audio]',
  ].join(';')
  return {
    input: paths.flatMap(path => ['-i', path]),
    output: ['-filter_complex', graph, '-map', '0:v:0', '-map', '[audio]', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-metadata', `comment=${stockAudio.title} by ${stockAudio.artist}; ${stockAudio.license}; recorded nature ambience under Mixkit Sound Effects Free License; no attribution required`],
  }
}
