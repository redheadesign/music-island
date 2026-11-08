import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import postcss from 'postcss'

const files = readdirSync('src', { recursive: true })
  .map((file) => file.replaceAll('\\', '/'))
  .filter((file) => file.endsWith('.css') && !/^(stories|features\/landing)\//.test(file))
  .sort()
const tokenFile = 'shared/styles/tokens.css'
const spacing = /^(?:margin|padding|(?:row-|column-)?gap)(?:-|$)/
const length = /(?<![\w.])(?:\d*\.)?\d+(?:px|rem|em|pt)(?![\w-])/i
const duration = /(?<![\w.])(?:\d*\.)?\d+(?:ms|s)(?![\w-])/i
const relative = /^(?:\d*\.)?\d+$/
const shared = /var\((--(?:space|radius|font|text|type|leading|weight|tracking|motion|ease)-[\w-]+)\s*(?=[,)])/g
const definitions = new Set()
const references = []
const issues = []

for (const file of files) {
  const from = join('src', file)
  postcss.parse(readFileSync(from, 'utf8'), { from }).walkDecls(({ prop, value, source }) => {
    const location = `${from}:${source.start.line}`
    if (prop.startsWith('--')) definitions.add(prop)
    for (const [, token] of value.matchAll(shared)) references.push({ location, token })
    if (file === tokenFile) return
    const raw = value.replace(/var\(--[\w-]+\)/g, '')
    let area
    if (spacing.test(prop) && length.test(raw)) area = 'spacing'
    if (/^(?:font|font-size|line-height|letter-spacing)$/.test(prop) && length.test(raw)) area = 'type'
    if (/^(?:font-weight|line-height)$/.test(prop) && relative.test(raw)) area = 'type'
    if (prop === 'font-family' && !value.includes('var(') && !/^(inherit|initial|unset|revert)$/.test(value)) area = 'type'
    if (prop.endsWith('radius') && (length.test(raw) || /\b(?:50|100)%/.test(raw))) area = 'radius'
    if (/^transition(?:-|$)/.test(prop) && duration.test(raw) && !/^0(?:ms|s)$/.test(raw)) area = 'motion'
    if (area) issues.push({ area, location, message: `${prop}: ${value}` })
  })
}
for (const { location, token } of references) {
  if (!definitions.has(token)) issues.push({ area: 'reference', location, message: `Undefined token ${token}` })
}
for (const { location, message } of issues.slice(0, 40)) console.error(`${location} ${message}`)
const counts = Object.fromEntries(['spacing', 'type', 'radius', 'motion', 'reference'].map(area => [
  area, issues.filter(issue => issue.area === area).length,
]))
console.log(`Design tokens · ${files.length} application stylesheets · ${Object.entries(counts).map(([key, count]) => `${key} ${count}`).join(', ')}`)
if (issues.length) process.exitCode = 1
