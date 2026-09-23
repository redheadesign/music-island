import { readFileSync } from 'node:fs'
// Local-only receiver for the Storybook export buttons. No arbitrary paths or URLs.
import http from 'node:http'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const timeline = JSON.parse(readFileSync(new URL('../src/stories/release/release3Motion.config.json', import.meta.url), 'utf8'))
const concepts = JSON.parse(readFileSync(new URL('../src/stories/release/release3Concepts.config.json', import.meta.url), 'utf8'))
const duration = timeline.cuts.at(-1)
const frameCount = duration * timeline.fps
const root = fileURLToPath(new URL('../', import.meta.url))
const names = { island: '01-island', taskbar: '02-taskbar', voice: '03-voice', usage: '04-usage', settings: '05-settings', dictation: '06-dictation' }
const telegram = { dictation: '01-dictation', models: '02-models', settings: '03-settings' }
const save = async (relative, data) => { const target = path.join(root, relative); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, data) }
http.createServer(async (req, res) => {
  if (req.headers.origin !== 'http://127.0.0.1:6006') { res.writeHead(403).end(); return }
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
  const match = /^\/(readme|telegram|frame|poster)\/([a-z0-9-]+)$/.exec(req.url ?? '')
  if (req.method !== 'POST' || !match || req.headers['content-type'] !== 'image/png') { res.writeHead(400).end(); return }
  try {
    const chunks = []; let bytes = 0
    for await (const chunk of req) { bytes += chunk.length; if (bytes > 32 * 1024 * 1024) throw new Error('Image exceeds 32 MB'); chunks.push(chunk) }
    const png = Buffer.concat(chunks), [ , kind, id] = match
    const info = await sharp(png).metadata()
    if (info.format !== 'png') throw new Error('Expected PNG')
    if (kind === 'readme' && names[id]) {
      if (info.width !== 2880 || info.height !== 1800) throw new Error('Expected 2x README master')
      await save(`release/media-3.0/masters/${names[id]}.png`, png)
      await save(`docs/media/v3/${names[id]}.webp`, await sharp(png).resize(1440,900).webp({ quality: 94 }).toBuffer())
    } else if (kind === 'telegram' && telegram[id]) {
      if (info.width !== 1080 || info.height !== 1350) throw new Error('Expected Telegram portrait')
      await save(`docs/releases/3.0/${telegram[id]}.png`, png)
    } else if (kind === 'frame' && /^(?:(continuous|rhythm)-)?(en|ru)-\d{5}$/.test(id)) {
      const parts = id.split('-'), frame = parts.pop(), locale = parts.pop(), concept = parts.pop()
      if (concept && locale !== 'ru') throw new Error('New concepts are RU only')
      const count = concept ? concepts[concept].cuts.at(-1) * timeline.fps : frameCount
      if (Number(frame) >= count || info.width !== (locale === 'en' ? 1920 : 1080) || info.height !== (locale === 'en' ? 1080 : 1920)) throw new Error('Invalid frame')
      const folder = concept ? `${concept}-${locale}` : locale
      await save(`.local/release3-frames/${folder}/${frame}.png`, png)
      if (Number(frame) % 90 === 0) console.log(`${folder}: ${frame}/${count}`)
    } else if (kind === 'poster' && /^(?:(continuous|rhythm)-)?(en|ru)$/.test(id)) {
      await save(`release/media-3.0/showreel-${id}-poster.png`, png)
    } else { throw new Error('Unknown export') }
    if (kind !== 'frame') console.log(`${kind}/${id}: saved`)
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"saved":true}')
  } catch (error) { console.error(error.message); res.writeHead(400).end(error.message) }
}).listen(6010, '127.0.0.1', () => console.log('Release media receiver: 127.0.0.1:6010; Storybook origin only'))
