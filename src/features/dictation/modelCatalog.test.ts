import { describe, expect, it } from 'vitest'
import type { ModelInfo } from '../../shared/lib/dictationTypes'
import { groupModels } from './modelCatalog'
const model = (id: string, installed: boolean, languages: string[] = []): ModelInfo => ({ id, name: id, description: '', is_downloaded: installed, supported_languages: languages } as ModelInfo)
describe('model catalogue after Handy import', () => {
  it('keeps imported and selected models visible without language metadata', () => {
    const current = model('gigaam-v3-e2e-rnnt-Q8_0.gguf', true)
    const imported = model('custom-en', true, ['en'])
    const result = groupModels([model('available-en', false, ['en']), imported, current], current.id, '', false)
    expect(result.installed.map((item) => item.id)).toEqual([current.id, imported.id])
    expect(result.catalog).toEqual([])
  })
  it('keeps a missing selected file discoverable and moves deleted models back to catalogue', () => {
    expect(groupModels([model('selected', false)], 'selected', 'different', false).installed).toHaveLength(1)
    expect(groupModels([model('deleted', false, ['ru'])], undefined, '', false).catalog).toHaveLength(1)
  })
  it('switches recommendations and language filtering without losing installed or selected models', () => {
    const russian = model('gigaam-v3-e2e-rnnt-Q8_0.gguf', false, ['ru'])
    const english = model('parakeet-unified-en-0.6b-Q8_0.gguf', false, ['en'])
    const installed = model('custom-ru', true, ['ru'])
    const other = { ...model('other-en', false, ['en']), is_recommended: true }
    const models = [other, installed, russian, english]
    const ru = groupModels(models, installed.id, '', false, 'ru')
    const en = groupModels(models, installed.id, '', false, 'en')
    expect(ru.catalog.map(x => x.id)).toEqual([russian.id])
    expect(en.catalog.map(x => x.id)).toEqual([english.id, other.id])
    expect(en.installed).toEqual(ru.installed)
    expect(groupModels(models, russian.id, '', false, 'en').installed[0].id).toBe(russian.id)
    expect(groupModels(models, installed.id, '', true, 'en').catalog).toContain(russian)
    expect(models[0]).toBe(other)
  })
})
