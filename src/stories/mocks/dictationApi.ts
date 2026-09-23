import { dictationApi as nativeApi } from '../../app/dictation/dictationApi'
import { dictationModels, dictationSettings } from '../dictationFixtures'
let settings = structuredClone(dictationSettings)
let models = structuredClone(dictationModels)
export function resetDictationPreview() { settings = structuredClone(dictationSettings); models = structuredClone(dictationModels) }
const preview = {
  initialize: async () => {},
  getModelLoadStatus: async () => ({ is_loaded: false, current_model: null }),
  getStatus: async () => ({revision: 1, operationId: 0, phase: 'idle' as const, ready: false, text: '', error: null}),
  getAvailableOutputDevices: async () => [{ index: '0', name: 'Speakers (USB Audio)', is_default: true }],
  getAvailableAccelerators: async () => ({transcribe: ['auto', 'cpu', 'gpu'], ort: ['auto', 'cpu'], gpu_devices: [{id: 'preview', name: 'Preview GPU', total_vram_mb: 8192}]}),
  previewHandyImport: async () => ({items: [{id: 'models/whisper-small.bin', name: 'Whisper Small', source: 'Handy/models/whisper-small.bin', bytes: 257_000_000, exists: false}], settings: ['bindings','custom_words'], settingsPath: 'Handy/settings_store.json'}),
  fetchPostProcessModels: async () => ['preview-model'],
  getAppSettings: async () => settings,
  getDefaultSettings: async () => dictationSettings,
  getAvailableModels: async () => models,
  getAvailableMicrophones: async () => [{ index: '0', name: 'Microphone (USB Audio)', is_default: true }],
  getMicrophoneChannels: async () => 2,
  getHistoryEntries: async () => ({ entries: [], has_more: false, next_cursor: null }),
  getAppDirPath: async () => 'C:\\Users\\User\\AppData\\Roaming\\Music Island\\dictation',
  setActiveModel: async (id: string) => { settings = { ...settings, selected_model: id }; return null },
  downloadModel: async (id: string) => { models = models.map((model) => model.id === id ? { ...model, is_downloaded: true } : model); return null },
  deleteModel: async (id: string) => { models = models.map((model) => model.id === id ? { ...model, is_downloaded: false } : model); return null },
  changeBinding: async (id: string, binding: string) => {
    const result = { id, name: id, description: '', default_binding: 'Ctrl+Space', current_binding: binding };
    settings = { ...settings, bindings: { ...settings.bindings, [id]: result } }; return { success: true, binding: result, error: null }
  },
  resetBinding: async (id: string) => {
    const result = { id, name: id, description: '', default_binding: 'Ctrl+Space', current_binding: 'Ctrl+Space', ...dictationSettings.bindings?.[id] };
    settings = { ...settings, bindings: { ...settings.bindings, [id]: result } }; return { success: true, binding: result, error: null }
  },
} satisfies Partial<typeof nativeApi>
export const dictationApi = new Proxy(nativeApi, { get: (_target, property: keyof typeof nativeApi) => property in preview ? preview[property as keyof typeof preview] : async () => null })
