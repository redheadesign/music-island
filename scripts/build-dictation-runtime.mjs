import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { writeIfChanged } from './build-files.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
export function cppBuildOutput(stdout) {
  const messages = stdout.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
  const builds = messages.filter(message => message.reason === 'build-script-executed' && /[#/]transcribe-cpp-sys[@/]/.test(message.package_id))
  if (builds.length !== 1) throw new Error('Cargo did not report one active transcribe-cpp-sys build')
  return path.join(builds[0].out_dir, 'bin')
}
export function buildDictationRuntime({ debug = false, skipBuild = false } = {}) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('The portable dictation bundle currently targets Windows x64.')
  const profile = debug ? 'debug' : 'release'
  const target = path.join(root, 'src-tauri/crates/handy-core/target')
  const ort = process.env.ORT_LIB_LOCATION ?? path.join(root, '.local/tools/ort/onnxruntime-win-x64-1.24.2/lib')
  const vulkan = process.env.VULKAN_SDK ?? path.join(root, '.local/tools/vulkan')
  const vs = process.env.VSINSTALLDIR ?? 'C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools'
  const cmake = process.env.CMAKE ?? path.join(vs, 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe')
  for (const file of [path.join(ort, 'onnxruntime.dll'), path.join(vulkan, 'Bin/glslc.exe'), cmake]) {
    if (!existsSync(file)) throw new Error(`Missing build prerequisite: ${file}. See docs/DICTATION.md.`)
  }
  const env = { ...process.env, CMAKE: cmake, VULKAN_SDK: vulkan, ORT_LIB_LOCATION: ort, ORT_PREFER_DYNAMIC_LINK: '1', CARGO_TARGET_DIR: target, CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? '2', TRANSCRIBE_CMAKE_ARGS: `-DSPIRV-Headers_DIR=${path.join(vulkan, 'Lib/cmake').replaceAll('\\', '/')}` }
  const selectionFile = path.join(root, `.local/dictation-cpp-${profile}.json`)
  const adapter = path.join(target, profile, 'music_island_dictation.dll')
  let output
  if (!skipBuild) {
    const result = spawnSync('cargo', ['build', '--manifest-path', 'src-tauri/crates/dictation-runtime/Cargo.toml', '--locked', '--message-format=json-render-diagnostics', ...debug ? [] : ['--release']], { cwd: root, env, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    if (result.status !== 0) throw new Error('Dictation runtime build failed')
    output = cppBuildOutput(result.stdout)
    mkdirSync(path.dirname(selectionFile), { recursive: true })
    writeIfChanged(selectionFile, JSON.stringify({ output, adapterSha256: createHash('sha256').update(readFileSync(adapter)).digest('hex') }))
  } else {
    const selection = JSON.parse(readFileSync(selectionFile, 'utf8'))
    if (selection.adapterSha256 !== createHash('sha256').update(readFileSync(adapter)).digest('hex')) throw new Error('The adapter changed; rebuild the dictation bundle before using --skip-build')
    output = selection.output
  }
  if (!existsSync(path.join(output, 'ggml-vulkan.dll'))) throw new Error('The active Vulkan inference backend is missing')
  const files = [adapter, ...readdirSync(output).filter((name) => name.endsWith('.dll')).map((name) => path.join(output, name)), ...['onnxruntime.dll', 'onnxruntime_providers_shared.dll'].map((name) => path.join(ort, name))]
  const redist = path.join(vs, 'VC/Redist/MSVC')
  const crt = process.env.MUSIC_ISLAND_VC_REDIST ?? readdirSync(redist).filter((name) => /^\d/.test(name)).sort().reverse().map((version) => path.join(redist, version, 'x64/Microsoft.VC143.CRT')).find(existsSync)
  if (!crt) throw new Error('Microsoft VC143 redistributable DLLs are required')
  files.push(...readdirSync(crt).filter((name) => name.endsWith('.dll')).map((name) => path.join(crt, name)))
  const digest = createHash('sha256')
  const manifest = files.map((file) => { const data = readFileSync(file); if (!data.length) throw new Error(`Empty dependency: ${file}`); const sha256 = createHash('sha256').update(data).digest('hex'); digest.update(path.basename(file)); digest.update(sha256); return { file: path.basename(file), bytes: data.length, sha256 } })
  const directory = path.join(root, '.local/dictation-bundles', `${profile}-${digest.digest('hex').slice(0, 20)}`)
  mkdirSync(directory, { recursive: true })
  files.forEach((file) => writeIfChanged(path.join(directory, path.basename(file)), readFileSync(file)))
  writeIfChanged(path.join(directory, 'manifest.json'), JSON.stringify({ abi: 1, upstream: 'Handy 0.9.7', commit: '05e0aedd2906f0d82722735f930465950c476b90', files: manifest }, null, 2))
  writeIfChanged(path.join(root, '.local/dictation-bundle-path.txt'), directory)
  return directory
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(buildDictationRuntime({ debug: process.argv.includes('--debug'), skipBuild: process.argv.includes('--skip-build') }))
