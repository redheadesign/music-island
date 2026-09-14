import { fn } from 'storybook/test'
import type {
  VoiceAppSettings,
  voicePluginApi as NativeVoiceApi,
} from '../../features/plugins/voice/pluginApi'
import { audioStats } from '../fixtures'

type PreviewState = {
  running?: boolean
  cableInstalled?: boolean
  failStart?: boolean
}
let state: Required<PreviewState>
export function resetVoicePreview(options: PreviewState = {}) {
  state = { running: false, cableInstalled: true, failStart: false, ...options }
}
resetVoicePreview()

const settings: VoiceAppSettings = {
  hotkey: '',
  hotkeyEnabled: false,
  hotkeyExplode: '',
  hotkeyExplodeEnabled: false,
  hotkeyMonitor: '',
  hotkeyMonitorEnabled: false,
  hotkeyBgm: '',
  hotkeyBgmEnabled: false,
  hotkeyEq: '',
  hotkeyEqEnabled: false,
  autostart: false,
  language: 'ru',
}
const noop = () => Promise.resolve()

export const voicePluginApi = {
  startDenoising: fn(async () => {
    if (state.failStart)
      throw new Error(
        'Не удалось открыть микрофон. Выберите другое устройство и повторите попытку.',
      )
    state.running = true
  }).mockName('voice.start'),
  stopDenoising: fn(async () => {
    state.running = false
  }).mockName('voice.stop'),
  updateDenoiseConfig: fn(noop).mockName('voice.config'),
  switchModel: fn(noop).mockName('voice.model'),
  getAudioStats: async () => structuredClone(audioStats),
  listInputDevices: async () => [
    'Микрофон · Studio USB',
    'Микрофон · Встроенный',
  ],
  listOutputDevices: async () =>
    state.cableInstalled
      ? ['CABLE Input (VB-Audio Virtual Cable)', 'Наушники · Studio USB']
      : ['Наушники · Studio USB'],
  listDenoiseModels: async () => ['rnnoise', 'deepfilter'],
  setMonitorMode: fn(noop),
  setMonitorPoint: fn(noop),
  updateEqConfig: fn(noop),
  getEqConfig: async () => ({
    enabled: false,
    bands: Array(10).fill(0) as number[],
  }),
  getEqFrequencies: async () => [
    31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
  ],
  setExplodeMode: fn<typeof NativeVoiceApi.setExplodeMode>(noop).mockName('voice.fxMode'),
  setExplodeEffect: fn<typeof NativeVoiceApi.setExplodeEffect>(noop).mockName('voice.fxEffect'),
  getVirtualRouteStatus: async () => ({
    cableInstalled: state.cableInstalled,
    cableInput: state.cableInstalled ? 'CABLE Input' : null,
    cableOutput: state.cableInstalled ? 'CABLE Output' : null,
    hasVoicemeeter: false,
    voicemeeterInput: null,
  }),
  installVBCable: fn(async () => {
    state.cableInstalled = true
    return {
      ok: true,
      cableInstalled: true,
      message: 'Демонстрация: виртуальный кабель подключён.',
      needsReboot: false,
    }
  }).mockName('voice.installCable.preview'),
  uninstallVBCable: fn(async () => {
    state.cableInstalled = false
    return {
      ok: true,
      cableInstalled: false,
      message: 'Демонстрация: виртуальный кабель отключён.',
      needsReboot: false,
    }
  }),
  getSettings: async () => ({ ...settings }),
  saveSettings: fn(noop),
  getStatus: async () => ({
    running: state.running,
    enabled: true,
    strength: 0.55,
    micGain: 1,
    agcEnabled: true,
    agcTarget: 0.12,
  }),
} satisfies typeof NativeVoiceApi
