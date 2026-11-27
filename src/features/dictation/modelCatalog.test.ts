import { describe, expect, it } from 'vitest'
import type { ModelInfo } from '../../shared/lib/dictationTypes'
import { catalogLanguages, groupModels, modelNotice } from './modelCatalog'
const model = (id: string, installed: boolean, languages: string[] = []): ModelInfo => ({ id, name: id, description: '', is_downloaded: installed, supported_languages: languages } as ModelInfo)
describe('model catalogue after Handy import', () => {
  it('links packaged GigaAM downloads to their original licensed checkpoints', () => {
    for (const [id, upstream, languages] of [
      ['gigaam-v4-rnnt', 'GigaAM-v4', ['ru', 'en']],
      ['gigaam-v4-rnnt-compact', 'GigaAM-v4', ['ru', 'en']],
      ['gigaam-multilingual-v2-rnnt', 'GigaAM-Multilingual-v2', ['ru', 'kk', 'de']],
    ] as const) {
      const pack = { ...model(id, false, [...languages]), source: 'GigaAMFiles' as const }
      expect(modelNotice(pack)).toEqual({ license: 'MIT', url: expect.stringMatching(
        new RegExp(`^https://huggingface\\.co/ai-sage/${upstream}/tree/[a-f0-9]{40}$`),
      ) })
      expect(groupModels([pack], undefined, '', [languages[1]]).catalog).toEqual([pack])
    }
  })
  it('shows one v4 entry, defaulting to compact and preserving either installed selection', () => {
    const compact = model('gigaam-v4-rnnt-compact', false, ['ru', 'en'])
    const streaming = model('gigaam-v4-rnnt', false, ['ru', 'en'])
    const legacy = model('gigaam-v3-e2e-rnnt-Q8_0.gguf', false, ['ru'])
    expect(groupModels([legacy, streaming, compact], undefined, '', ['ru']).catalog).toEqual([compact, legacy])

    const installedStreaming = { ...streaming, is_downloaded: true }
    const previous = groupModels([compact, installedStreaming], streaming.id, '', ['ru'])
    expect(previous.installed).toEqual([installedStreaming])
    expect(previous.catalog).toEqual([])

    const installedCompact = { ...compact, is_downloaded: true }
    const both = [installedStreaming, installedCompact]
    expect(groupModels(both, streaming.id, '', []).installed).toEqual([installedStreaming])
    expect(groupModels(both, compact.id, '', []).installed).toEqual([installedCompact])
    expect(groupModels(both, undefined, '', []).installed).toEqual([installedCompact])
  })
  it('keeps imported and selected models visible without language metadata', () => {
    const current = model('gigaam-v3-e2e-rnnt-Q8_0.gguf', true)
    const imported = model('custom-en', true, ['en'])
    const result = groupModels([model('available-en', false, ['en']), imported, current], current.id, '', ['ru'])
    expect(result.installed.map((item) => item.id)).toEqual([current.id, imported.id])
    expect(result.catalog).toEqual([])
  })
  it('keeps a missing selected file discoverable and moves deleted models back to catalogue', () => {
    expect(groupModels([model('selected', false)], 'selected', 'different', ['ru']).installed).toHaveLength(1)
    expect(groupModels([model('deleted', false, ['ru'])], undefined, '', ['ru']).catalog).toHaveLength(1)
  })
  it('switches recommendations and language filtering without losing installed or selected models', () => {
    const russian = model('gigaam-v4-rnnt', false, ['ru', 'en'])
    const compact = model('gigaam-v3-e2e-rnnt-Q8_0.gguf', false, ['ru'])
    const ctc = model('gigaam-v3-ctc-Q8_0.gguf', false, ['ru'])
    const multilingual = model('gigaam-multilingual-v2-rnnt', false, ['ru', 'en', 'de'])
    const english = model('parakeet-unified-en-0.6b-Q8_0.gguf', false, ['en'])
    const installed = model('custom-ru', true, ['ru'])
    const other = { ...model('other-en', false, ['en']), is_recommended: true }
    const models = [other, multilingual, installed, ctc, compact, english, russian]
    const ru = groupModels(models, installed.id, '', ['ru'], 'ru')
    const en = groupModels(models, installed.id, '', ['en'], 'en')
    expect(ru.catalog).toEqual([russian, compact, ctc, multilingual])
    expect(en.catalog).toEqual([english, other, multilingual, russian])
    expect(groupModels(models, installed.id, '', [], 'ru').catalog[0]).toBe(russian)
    expect(groupModels(models, installed.id, '', ['ru'], 'en').catalog).toEqual(ru.catalog)
    expect(groupModels(models, installed.id, '', ['en'], 'ru').catalog).toEqual(en.catalog)
    expect(en.installed).toEqual(ru.installed)
    expect(groupModels(models, compact.id, '', ['en'], 'en').installed[0]).toBe(compact)
    expect(groupModels(models, installed.id, '', [], 'en').catalog).toContain(compact)
    expect(models[0]).toBe(other)
  })
  it('combines checked languages and resets filtering when none are checked', () => {
    const models = [model('ru', false, ['ru']), model('en-fr', false, ['en', 'fr']), model('de', false, ['de'])]
    expect(groupModels(models, undefined, '', ['ru', 'en']).catalog.map(item => item.id)).toEqual(['ru', 'en-fr'])
    expect(groupModels(models, undefined, 'en-fr', ['ru', 'en']).catalog.map(item => item.id)).toEqual(['en-fr'])
    expect(groupModels(models, undefined, '', []).catalog).toHaveLength(3)
  })
  it('pins English and Russian before the remaining unique catalog languages', () => {
    const languages = catalogLanguages([model('many', false, ['de', 'fr', 'en', 'de'])], 'ru')
    expect(languages.map(item => item.code)).toEqual(['en', 'ru', 'de', 'fr'])
    expect(languages.slice(0, 2).map(item => item.label)).toEqual(['Английский', 'Русский'])
  })
})
