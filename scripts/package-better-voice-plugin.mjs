/**
 * Packages a Better Voice sidecar into Music Island plugin folders for local testing.
 *
 * Sources (first hit wins):
 *   BETTER_VOICE_DIR env, or ../better-voice next to this repo
 *
 * Writes:
 *   1) release/plugins/better-voice/   (exe-sibling kit)
 *   2) %APPDATA%/Music Island/plugins/better-voice/
 */
import { copyFile, cp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const siblingDefault = path.resolve(rootDir, '..', 'better-voice')
const bvRoot = process.env.BETTER_VOICE_DIR
  ? path.resolve(process.env.BETTER_VOICE_DIR)
  : siblingDefault

const releaseCandidates = [
  path.join(bvRoot, 'src-tauri', 'target', 'release', 'meowmic.exe'),
  path.join(bvRoot, 'src-tauri', 'target', 'debug', 'meowmic.exe'),
]

const resourcesDir = path.join(bvRoot, 'src-tauri', 'resources')

async function firstExisting(paths) {
  for (const candidate of paths) {
    try {
      await stat(candidate)
      return candidate
    } catch {
      // try next
    }
  }
  return null
}

const exePath = await firstExisting(releaseCandidates)
if (!exePath) {
  throw new Error(
    `Better Voice binary not found under ${bvRoot}. Build it with npm run tauri:build first.`,
  )
}

const manifest = {
  id: 'better-voice',
  name: 'Better Voice',
  version: '0.3.0',
  icon: 'mic',
  entryExe: 'meowmic.exe',
  entryArgs: ['--island-sidecar', '--hidden'],
  ipc: {
    kind: 'tcp',
    host: '127.0.0.1',
    port: 38472,
  },
  island: {
    railActions: ['toggle', 'open-settings'],
    maxButtons: 2,
  },
  settings: {
    panel: 'voice',
  },
}

const targets = [path.join(rootDir, 'release', 'plugins', 'better-voice')]
if (process.env.APPDATA) {
  targets.push(path.join(process.env.APPDATA, 'Music Island', 'plugins', 'better-voice'))
}

for (const target of targets) {
  await rm(target, { recursive: true, force: true })
  await mkdir(target, { recursive: true })
  await copyFile(exePath, path.join(target, 'meowmic.exe'))
  try {
    await cp(resourcesDir, path.join(target, 'resources'), { recursive: true })
  } catch (error) {
    console.warn(`resources copy skipped for ${target}: ${error.message}`)
  }
  await writeFile(path.join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  const readme = [
    'Better Voice plugin for Music Island',
    '',
    `Packed from: ${exePath}`,
    'Enable in Settings → Plugins.',
    'Sidecar IPC: 127.0.0.1:38472',
    '',
  ].join('\n')
  await writeFile(path.join(target, 'README.txt'), readme, 'utf8')
  console.log(`Packed plugin → ${target}`)
}
