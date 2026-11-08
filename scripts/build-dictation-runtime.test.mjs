import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, statSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { cppBuildOutput } from './build-dictation-runtime.mjs'
import { writeIfChanged } from './build-files.mjs'

test('uses Cargo selection, including fresh builds, instead of DLL timestamps', () => {
  const message = JSON.stringify({ reason: 'build-script-executed', package_id: 'registry+https://github.com/rust-lang/crates.io-index#transcribe-cpp-sys@0.2.4', out_dir: 'active/out' })
  assert.equal(cppBuildOutput(message), path.join('active/out', 'bin'))
  assert.throws(() => cppBuildOutput(''), /one active/)
  assert.throws(() => cppBuildOutput(`${message}\n${message}`), /one active/)
})
test('a cache hit leaves timestamps untouched and same-length corruption is repaired', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'music-island-build-'))
  try {
    const file = path.join(dir, 'engine.dll')
    assert.equal(writeIfChanged(file, 'valid'), true)
    const modified = statSync(file).mtimeMs
    assert.equal(writeIfChanged(file, Buffer.from('valid')), false)
    assert.equal(statSync(file).mtimeMs, modified)
    writeFileSync(file, 'wrong')
    assert.equal(writeIfChanged(file, 'valid'), true)
    assert.equal(readFileSync(file, 'utf8'), 'valid')
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(dir).startsWith('music-island-build-'))
    rmSync(dir, { recursive: true })
  }
})
