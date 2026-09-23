import fs from 'node:fs/promises'
import sharp from 'sharp'

// The user's original stays outside the repository and is never modified.
const source = process.argv[2]
if (!source) throw new Error('Usage: node scripts/generate-portrait-logo.mjs path-to-original.jpg')
const standard = await fs.readFile('assets/app-icon.svg','utf8')
const photo = await sharp(source).rotate().extract({left:700,top:100,width:2880,height:2880}).resize(768,768).webp({quality:86}).toBuffer()
const center = standard.match(/<path d="([^"]+)" fill="url\(#paint1_linear_2439_2\)"\/>/)
if (!center) throw new Error('Original center-circle path is missing')
const svg = standard.replace(center[0],`<defs><clipPath id="portrait-circle"><path d="${center[1]}"/></clipPath></defs><image x="208.946" y="208.857" width="603.567" height="607.287" preserveAspectRatio="xMidYMid slice" clip-path="url(#portrait-circle)" href="data:image/webp;base64,${photo.toString('base64')}"/>`)
if (Buffer.byteLength(svg) > 200000) throw new Error('Portrait SVG exceeds 200 KB')
await fs.writeFile('assets/author-portrait.webp',photo)
await fs.writeFile('assets/app-icon-portrait.svg',svg)
console.log(`WebP ${photo.length} bytes; complete SVG ${Buffer.byteLength(svg)} bytes`)
