import { spawnSync } from 'node:child_process'
import { buildDictationRuntime } from './build-dictation-runtime.mjs'
const directory = buildDictationRuntime()
// The release channel ships a single EXE. Never download/build an NSIS installer.
const args = process.argv.slice(2)
if (!args.includes('--no-bundle')) args.push('--no-bundle')
const result = spawnSync(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', 'build', ...args], { env: { ...process.env, MUSIC_ISLAND_DICTATION_BUNDLE: directory }, stdio: 'inherit' })
process.exit(result.status ?? 1)
