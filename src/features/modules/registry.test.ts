import { describe, expect, it } from 'vitest'
import { reservedModules } from './registry'

describe('reservedModules', () => {
  it('keeps extension points for planned productivity modules', () => {
    const ids = reservedModules.map((module) => module.id)

    expect(ids).toContain('todo')
    expect(ids).toContain('notes')
    expect(ids).toContain('transcription')
    expect(ids).toContain('command-palette')
  })

  it('contains user-facing descriptions for roadmap visibility', () => {
    for (const module of reservedModules) {
      expect(module.title.length).toBeGreaterThan(0)
      expect(module.description.length).toBeGreaterThan(20)
    }
  })
})
