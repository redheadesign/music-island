import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { publishBuildDirectory, removeBuildPath } from './build-files.mjs'

test('frontend output preserves identical files and removes obsolete assets', () => {
  const temporary = realpathSync(tmpdir())
  const fixture = mkdtempSync(path.join(temporary, 'music-island-build-'))
  try {
    const source = path.join(fixture, 'source')
    const destination = path.join(fixture, 'dist')
    mkdirSync(path.join(source, 'assets'), { recursive: true })
    mkdirSync(path.join(destination, 'assets'), { recursive: true })
    writeFileSync(path.join(source, 'index.html'), 'new html')
    writeFileSync(path.join(source, 'assets/logo.svg'), 'same content')
    writeFileSync(path.join(destination, 'index.html'), 'old html')
    writeFileSync(path.join(destination, 'assets/logo.svg'), 'same content')
    writeFileSync(path.join(destination, 'assets/old.js'), 'stale bundle')

    const logo = path.join(destination, 'assets/logo.svg')
    const modified = statSync(logo).mtimeMs
    publishBuildDirectory(source, destination)
    assert.equal(readFileSync(path.join(destination, 'index.html'), 'utf8'), 'new html')
    assert.deepEqual(readdirSync(path.join(destination, 'assets')), ['logo.svg'])
    assert.equal(statSync(logo).mtimeMs, modified)

    const output = statSync(destination).mtimeMs
    publishBuildDirectory(source, destination)
    assert.equal(statSync(destination).mtimeMs, output)
  } finally {
    removeBuildPath(temporary, fixture)
  }
})

test('frontend output preserves case-only file and directory renames', () => {
  const temporary = realpathSync(tmpdir())
  const fixture = mkdtempSync(path.join(temporary, 'music-island-build-'))
  try {
    const source = path.join(fixture, 'source')
    const destination = path.join(fixture, 'dist')
    mkdirSync(path.join(source, 'Assets'), { recursive: true })
    mkdirSync(path.join(destination, 'assets'), { recursive: true })
    writeFileSync(path.join(source, 'Assets/icon.svg'), 'new icon')
    writeFileSync(path.join(destination, 'assets/icon.svg'), 'old icon')
    writeFileSync(path.join(source, 'Logo.svg'), 'same logo')
    writeFileSync(path.join(destination, 'logo.svg'), 'same logo')

    publishBuildDirectory(source, destination)
    assert.deepEqual(readdirSync(destination).sort(), ['Assets', 'Logo.svg'])
    assert.equal(readFileSync(path.join(destination, 'Logo.svg'), 'utf8'), 'same logo')
    assert.equal(readFileSync(path.join(destination, 'Assets/icon.svg'), 'utf8'), 'new icon')
  } finally {
    removeBuildPath(temporary, fixture)
  }
})
