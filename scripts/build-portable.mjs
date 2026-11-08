import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildDictationRuntime } from './build-dictation-runtime.mjs'
const directory = buildDictationRuntime()
const assetCache = fileURLToPath(new URL('../.local/embedded-assets-zlib-v1', import.meta.url))
// The release channel ships a single EXE. Never download/build an NSIS installer.
const args = process.argv.slice(2)
if (!args.includes('--no-bundle')) args.push('--no-bundle')
const result = spawnSync(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', 'build', ...args], { env: { ...process.env, MUSIC_ISLAND_DICTATION_BUNDLE: directory, MUSIC_ISLAND_ASSET_CACHE: assetCache }, stdio: 'inherit' })
process.exit(result.status ?? 1)
