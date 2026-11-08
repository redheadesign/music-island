import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { publishBuildDirectory, removeBuildPath } from './build-files.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))

function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules', script), ...args], {
    cwd: root,
    stdio: 'inherit',
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

function main(args) {
  const typecheck = run('typescript/bin/tsc', ['-b'])
  if (typecheck !== 0) return typecheck
  // Explicit Vite flags keep their normal output behavior, including --outDir and --watch.
  if (args.length > 0) return run('vite/bin/vite.js', ['build', ...args])

  const local = path.join(root, '.local')
  mkdirSync(local, { recursive: true })
  const stage = mkdtempSync(path.join(local, 'frontend-'))
  try {
    const build = run('vite/bin/vite.js', ['build', '--outDir', stage])
    if (build !== 0) return build
    publishBuildDirectory(stage, path.join(root, 'dist'))
    return 0
  } finally {
    removeBuildPath(realpathSync(root), stage)
  }
}

process.exitCode = main(process.argv.slice(2))
