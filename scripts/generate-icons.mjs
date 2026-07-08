import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const rootDir = process.cwd()
const sourcePath = path.join(rootDir, 'assets', 'app-icon.svg')
const iconsDir = path.join(rootDir, 'src-tauri', 'icons')

await mkdir(iconsDir, { recursive: true })

const svg = await readFile(sourcePath)
const sizes = [16, 32, 48, 64, 128, 256]
const pngBuffers = await Promise.all(
  sizes.map((size) =>
    sharp(svg)
      .resize(size, size, { fit: 'contain' })
      .png()
      .toBuffer(),
  ),
)

await writeFile(path.join(rootDir, 'assets', 'app-icon.png'), pngBuffers[pngBuffers.length - 1])
await writeFile(path.join(iconsDir, 'icon.ico'), await pngToIco(pngBuffers))

console.log(`Generated ${path.join(iconsDir, 'icon.ico')} from ${sourcePath}`)
