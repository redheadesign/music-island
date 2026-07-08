import { copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const releaseDir = path.join(rootDir, 'release')
const tauriReleaseDir = path.join(rootDir, 'src-tauri', 'target', 'release')
const bundleDir = path.join(tauriReleaseDir, 'bundle')

const artifactPatterns = [
  {
    label: 'Recommended installer',
    directory: path.join(bundleDir, 'nsis'),
    match: (fileName) => fileName.startsWith('Music Island_') && fileName.endsWith('-setup.exe'),
  },
  {
    label: 'MSI installer',
    directory: path.join(bundleDir, 'msi'),
    match: (fileName) => fileName.startsWith('Music Island_') && fileName.endsWith('.msi'),
  },
  {
    label: 'Portable app binary',
    directory: tauriReleaseDir,
    match: (fileName) => fileName === 'music-island.exe',
  },
]

await rm(releaseDir, { recursive: true, force: true })
await mkdir(releaseDir, { recursive: true })

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

const readme = [
  'Music Island release artifacts',
  '',
  'Give users the NSIS setup .exe from this folder.',
  'MSI files are optional advanced installers.',
  'The plain music-island.exe is useful for quick local smoke checks, not distribution.',
  '',
  ...copied.map((artifact) => `- ${artifact.label}: ${artifact.fileName} (${artifact.sizeMb} MB)`),
  '',
].join('\n')

await writeFile(path.join(releaseDir, 'README.txt'), readme, 'utf8')

console.log(`Copied ${copied.length} release artifact(s) to ${releaseDir}`)
for (const artifact of copied) {
  console.log(`- ${artifact.fileName} (${artifact.sizeMb} MB)`)
}

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
