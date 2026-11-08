import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
const api = read('src/app/dictation/dictationApi.ts')
const native = read('src-tauri/crates/handy-core/src/lib.rs')
const commands = [...new Set([...api.matchAll(/plugin:dictation\|([a-z_]+)/g)].map((match) => match[1]))].sort()
const latestOnly = ['copy_history_message', 'get_latest_history_message']

it('registers every frontend dictation command and reserves the latest-message commands for the island', () => {
  const handlers = native.split('tauri::generate_handler![')[1].split('])')[0]
    .split(',').map((entry) => entry.trim().split('::').at(-1)).filter(Boolean).sort()
  expect(handlers).toEqual(commands)
  const permission = read('src-tauri/permissions/dictation/settings.toml')
  const allowed = [...permission.split('commands.allow = [')[1].matchAll(/"([a-z_]+)"/g)].map((match) => match[1]).sort()
  expect(allowed).toEqual(commands.filter(command => !latestOnly.includes(command)))
  expect(read('src-tauri/build.rs')).toContain('.plugin("dictation", tauri_build::InlinedPlugin::new())')
  const capability = JSON.parse(read('src-tauri/capabilities/dictation-settings.json'))
  expect(capability.windows).toEqual(['settings'])
  expect(capability.permissions).toContain('dictation:settings')
})

it('limits the island to the latest transcript and keeps all history out of the recording overlay', () => {
  const permission = read('src-tauri/permissions/dictation/controls.toml')
  const lists = [...permission.matchAll(/commands.allow = \[([^\]]+)\]/g)]
    .map((match) => [...match[1].matchAll(/"([a-z_]+)"/g)].map((item) => item[1]).sort())
  expect(lists).toEqual([
    [...latestOnly, 'get_status', 'toggle'],
    ['cancel_operation', 'copy_result', 'get_status', 'toggle'],
  ])
  for (const [name, window] of [['controls', 'main'], ['overlay', 'recording_overlay']]) {
    const capability = JSON.parse(read(`src-tauri/capabilities/dictation-${name}.json`))
    expect(capability.windows).toEqual([window])
    expect(capability.permissions).toEqual([`dictation:${name}`])
  }
})
