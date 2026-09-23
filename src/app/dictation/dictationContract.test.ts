import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
const api = read('src/app/dictation/dictationApi.ts')
const native = read('src-tauri/crates/handy-core/src/lib.rs')
const commands = [...new Set([...api.matchAll(/plugin:dictation\|([a-z_]+)/g)].map((match) => match[1]))].sort()

it('registers every frontend dictation command in the native plugin and its settings ACL', () => {
  const handlers = native.split('tauri::generate_handler![')[1].split('])')[0]
    .split(',').map((entry) => entry.trim().split('::').at(-1)).filter(Boolean).sort()
  expect(handlers).toEqual(commands)
  const permission = read('src-tauri/permissions/dictation/settings.toml')
  const allowed = [...permission.split('commands.allow = [')[1].matchAll(/"([a-z_]+)"/g)].map((match) => match[1]).sort()
  expect(allowed).toEqual(commands)
  expect(read('src-tauri/build.rs')).toContain('.plugin("dictation", tauri_build::InlinedPlugin::new())')
  const capability = JSON.parse(read('src-tauri/capabilities/dictation-settings.json'))
  expect(capability.windows).toEqual(['settings'])
  expect(capability.permissions).toContain('dictation:settings')
})

it('keeps history, downloads and credentials out of the island and overlay capabilities', () => {
  const permission = read('src-tauri/permissions/dictation/controls.toml')
  const allowed = [...permission.matchAll(/commands.allow = \[([^\]]+)\]/g)]
    .flatMap((match) => [...match[1].matchAll(/"([a-z_]+)"/g)].map((item) => item[1]))
  expect([...new Set(allowed)].sort()).toEqual(['cancel_operation', 'copy_result', 'get_status', 'toggle'])
  for (const [name, window] of [['controls', 'main'], ['overlay', 'recording_overlay']]) {
    const capability = JSON.parse(read(`src-tauri/capabilities/dictation-${name}.json`))
    expect(capability.windows).toEqual([window])
    expect(capability.permissions).toEqual([`dictation:${name}`])
  }
})
