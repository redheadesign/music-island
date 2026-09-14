import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const releaseDir = path.join(rootDir, 'release')
const tauriReleaseDir = path.join(rootDir, 'src-tauri', 'target', 'release')
const artifactPatterns = [
  {
    label: 'Portable app binary',
    directory: tauriReleaseDir,
    match: (fileName) => fileName === 'music-island.exe',
  },
]

await mkdir(releaseDir, { recursive: true })
await rm(path.join(releaseDir, 'music-island.exe'), { force: true })
await rm(path.join(releaseDir, 'SHA256.txt'), { force: true })
await rm(path.join(releaseDir, 'README.txt'), { force: true })
// Voice assets live inside the exe → AppData; never ship a sibling resources/ folder.
await rm(path.join(releaseDir, 'resources'), { recursive: true, force: true })

const copied = []

for (const pattern of artifactPatterns) {
  const files = await safeReadDir(pattern.directory)

  for (const fileName of files.filter(pattern.match)) {
    const sourcePath = path.join(pattern.directory, fileName)
    const targetPath = path.join(releaseDir, fileName)
    const sourceStat = await stat(sourcePath)

    await copyFile(sourcePath, targetPath)
    copied.push({
      label: pattern.label,
      fileName,
      sizeMb: (sourceStat.size / 1024 / 1024).toFixed(1),
    })
  }
}

if (copied.length === 0) {
  throw new Error('No release artifacts found. Run `npm run tauri:build` first.')
}

const portableExecutable = copied.find((artifact) => artifact.fileName === 'music-island.exe')
if (!portableExecutable) {
  throw new Error('Portable music-island.exe was not copied.')
}
const executableHash = await sha256File(path.join(releaseDir, portableExecutable.fileName))
await writeFile(
  path.join(releaseDir, 'SHA256.txt'),
  `${executableHash}  ${portableExecutable.fileName}\n`,
  'ascii',
)

const readme = [
  'Music Island release artifacts',
  '',
  'Portable Windows build. Single executable — no installer, no resources folder.',
  'Better Voice assets extract once to %APPDATA%\\Music Island\\voice\\ on first use.',
  '',
  ...copied.map((artifact) => `- ${artifact.label}: ${artifact.fileName} (${artifact.sizeMb} MB)`),
  '',
].join('\n')

await writeFile(path.join(releaseDir, 'README.txt'), readme, 'utf8')

console.log(`Copied ${copied.length} release artifact(s) to ${releaseDir}`)
for (const artifact of copied) {
  console.log(`- ${artifact.fileName} (${artifact.sizeMb} MB)`)
}
console.log('- SHA256.txt')

async function safeReadDir(directory) {
  try {
    return await readdir(directory)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }
    throw error
  }
}

async function sha256File(filePath) {
  const hash = createHash('sha256')
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return hash.digest('hex')
}
