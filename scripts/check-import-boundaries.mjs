import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const sourceRoot = path.join(root, 'src')
const sourceExtensions = new Set(['.ts', '.tsx'])
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g

const files = await collectSourceFiles(sourceRoot)
const violations = []

for (const file of files) {
  const source = await readFile(file, 'utf8')
  for (const match of source.matchAll(importPattern)) {
    const target = resolveSourceImport(file, match[1])
    if (!target) continue
    const violation = validateBoundary(file, target)
    if (violation) violations.push(`${relative(file)} -> ${relative(target)}: ${violation}`)
  }
}

if (violations.length > 0) {
  console.error(`Import boundary violations:\n${violations.map((item) => `- ${item}`).join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`Import boundaries passed (${files.length} source files checked).`)
}

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(target)
    return sourceExtensions.has(path.extname(entry.name)) ? [target] : []
  }))
  return nested.flat()
}

function resolveSourceImport(importer, specifier) {
  if (!specifier.startsWith('.')) return null
  return path.resolve(path.dirname(importer), specifier)
}

function validateBoundary(importer, target) {
  const sourceLayer = layerOf(importer)
  const targetLayer = layerOf(target)
  if (sourceLayer === 'shared' && targetLayer !== 'shared') {
    return 'shared code must not depend on app or feature code'
  }
  if (sourceLayer === 'app' && targetLayer === 'features') {
    return 'app orchestration must not depend on feature UI'
  }
  if (sourceLayer === 'features' && targetLayer === 'app') {
    const allowed = new Set(['app/useIslandApp', 'app/tauriApi'])
    if (![...allowed].some((entry) => relative(target).replace(/\.[^.]+$/, '') === entry)) {
      return 'features may import only the app facade or the Tauri adapter'
    }
  }
  return null
}

function layerOf(file) {
  return relative(file).split('/')[0]
}

function relative(file) {
  return path.relative(sourceRoot, file).replaceAll(path.sep, '/')
}
