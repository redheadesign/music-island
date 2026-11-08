import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export function writeIfChanged(file, data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data)
  if (existsSync(file) && readFileSync(file).equals(bytes)) return false
  writeFileSync(file, bytes)
  return true
}

export function removeBuildPath(root, entry) {
  const relative = path.relative(root, realpathSync(entry))
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Generated path is outside its build directory: ${entry}`)
  }
  rmSync(entry, { recursive: true })
}

export function publishBuildDirectory(source, destination) {
  mkdirSync(destination, { recursive: true })
  const root = realpathSync(destination)
  if (root !== path.join(realpathSync(path.dirname(destination)), path.basename(destination))) {
    throw new Error(`Build output is redirected: ${destination}`)
  }

  function remove(directory, entry) {
    const target = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) unlinkSync(target)
    else removeBuildPath(root, target)
  }

  function sync(from, to) {
    const incoming = readdirSync(from, { withFileTypes: true })
    const names = new Set(incoming.map(entry => entry.name))
    const existingEntries = new Map(readdirSync(to, { withFileTypes: true }).map(entry => [entry.name, entry]))
    // Remove old spellings before writing: Windows may resolve case-only renames to the same path.
    for (const entry of existingEntries.values()) {
      if (!names.has(entry.name)) remove(to, entry)
    }
    for (const entry of incoming) {
      const input = path.join(from, entry.name)
      const target = path.join(to, entry.name)
      if (!entry.isDirectory() && !entry.isFile()) throw new Error(`Unsupported build output: ${input}`)
      const existing = existingEntries.get(entry.name)
      if (existing && (existing.isSymbolicLink() || existing.isDirectory() !== entry.isDirectory())) {
        remove(to, existing)
      }
      if (entry.isDirectory()) {
        mkdirSync(target, { recursive: true })
        sync(input, target)
      } else {
        writeIfChanged(target, readFileSync(input))
      }
    }
  }

  sync(source, root)
}
