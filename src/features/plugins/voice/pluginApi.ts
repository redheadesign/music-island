import { invoke } from '@tauri-apps/api/core'

async function call<T>(method: string, params?: unknown): Promise<T> {
  return invoke<T>('voice_invoke', { method, params: params ?? {} })
}

export type AudioStats = {
  input_level: number
  output_level: number
  input_peak: number
  post_gain_peak: number
  input_clipping: boolean
  noise_reduction_db: number
  latency_ms: number
  cpu_usage: number
  frames_processed: number
  spectrum: number[]
  spectrum_out: number[]
  frames_dropped: number
}

export type VirtualRouteStatus = {
  cableInstalled: boolean
  cableInput: string | null
  cableOutput: string | null
  hasVoicemeeter: boolean
  voicemeeterInput: string | null
}

export type VbCableResult = {
  ok: boolean
  cableInstalled: boolean
  message: string
  needsReboot: boolean
}

export type VoiceAppSettings = {
  hotkey: string
  hotkeyEnabled: boolean
  hotkeyExplode: string
  hotkeyExplodeEnabled: boolean
  hotkeyMonitor: string
  hotkeyMonitorEnabled: boolean
  hotkeyBgm: string
  hotkeyBgmEnabled: boolean
  hotkeyEq: string
  hotkeyEqEnabled: boolean
  autostart: boolean
  language: string
}

export const voicePluginApi = {
  startDenoising: (inputDevice?: string, outputDevice?: string, model?: string, monitorEnabled?: boolean) =>
    call('start_denoising', { inputDevice, outputDevice, model, monitorEnabled }),
  stopDenoising: () => call('stop_denoising'),
  updateDenoiseConfig: (config: {
    enabled?: boolean
    strength?: number
    micGain?: number
    suppressLevel?: number
    agcEnabled?: boolean
    agcTarget?: number
  }) => call('update_denoise_config', config),
  switchModel: (modelName: string) => call('switch_model', { modelName }),
  getAudioStats: () => call<AudioStats>('get_audio_stats'),
  listInputDevices: () => call<string[]>('list_input_devices'),
  listOutputDevices: () => call<string[]>('list_output_devices'),
  listDenoiseModels: () => call<string[]>('list_denoise_models'),
  setMonitorMode: (enabled: boolean) => call('set_monitor_mode', { enabled }),
  setMonitorPoint: (point: number) => call('set_monitor_point', { point }),
  updateEqConfig: (config: { enabled?: boolean; bands?: number[] }) => call('update_eq_config', config),
  getEqConfig: () => call<{ enabled: boolean; bands: number[] }>('get_eq_config'),
  getEqFrequencies: () => call<number[]>('get_eq_frequencies'),
  setExplodeMode: (enabled: boolean, intensity?: number) => call('set_explode_mode', { enabled, intensity }),
  setExplodeEffect: (effect: number) => call('set_explode_effect', { effect }),
  getVirtualRouteStatus: () => call<VirtualRouteStatus>('get_virtual_route_status'),
  installVBCable: () => call<VbCableResult>('install_vb_cable'),
  uninstallVBCable: () => call<VbCableResult>('uninstall_vb_cable'),
  getSettings: () => call<VoiceAppSettings>('get_settings'),
  saveSettings: (settings: VoiceAppSettings) => call('save_settings', { settings }),
  getStatus: () =>
    call<{
      running: boolean
      enabled: boolean
      strength: number
      micGain: number
      agcEnabled: boolean
      agcTarget: number
    }>('get_status'),
}
