import type { DictationController } from '../../app/useIslandApp'
import { dictationApi } from '../mocks/dictationApi'
import { dictationSettings, gigaamRnnt, parakeetEnglish } from '../dictationFixtures'

export const noop = () => {}
export const asyncNoop = async () => {}
export function releaseModel(locale: 'en' | 'ru') { return locale === 'ru' ? gigaamRnnt : parakeetEnglish }
export function releaseDictation(locale: 'en' | 'ru'): DictationController {
  const model = releaseModel(locale)
  return { enabled: true, api: dictationApi, busy: null, error: null, progress: {}, enable: asyncNoop, disable: asyncNoop, loadMoreHistory: asyncNoop, refresh: asyncNoop, run: async (_id, action) => { await action() }, data: {
    settings: { ...dictationSettings, selected_model: model.id }, models: [{ ...model, is_downloaded: true }], microphones: [{ index: '0', name: 'Microphone', is_default: true }], path: 'C:\\Users\\You\\AppData\\Roaming\\Music Island\\dictation',
    history: [{ id: 1, file_name: 'demo.wav', timestamp: 1790164800, saved: true, title: '', transcription_text: locale === 'ru' ? 'Хорошие идеи начинаются с пары слов' : 'Good ideas begin with a few words', post_processed_text: null, post_process_prompt: null, post_process_requested: false }], modelStatus: { is_loaded: true, current_model: model.id },
  } }
}
