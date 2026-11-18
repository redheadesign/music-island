// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { voicePluginApi, type AudioStats } from './pluginApi'
import { VoiceLiveMeters } from './VoiceLiveMeters'

vi.mock('./VoiceSignalFlow', () => ({ VoiceSignalFlow: () => null }))
vi.mock('./pluginApi', () => ({ voicePluginApi: { getAudioStats: vi.fn() } }))

it('waits for a slow meter read and stops requesting samples when the section closes', async () => {
  vi.useFakeTimers()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const root = createRoot(document.createElement('div'))
  const read = vi.mocked(voicePluginApi.getAudioStats)
  let finish!: (stats: AudioStats) => void
  read.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const endpoint = { label: 'Device', value: '', options: [], onChange: vi.fn() }
  const render = (active: boolean) => root.render(<VoiceLiveMeters input={endpoint} output={endpoint}
    processingLabel="Processing" runningLabel="Running" stoppedLabel="Stopped" running active={active} />)
  try {
    await act(async () => render(true))
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(read).toHaveBeenCalledTimes(1)
    const stats: AudioStats = {
      input_level: -12, output_level: -6, input_peak: -12, post_gain_peak: -6, input_clipping: false,
      noise_reduction_db: 0, latency_ms: 0, cpu_usage: 0, frames_processed: 0, frames_dropped: 0,
      spectrum: [], spectrum_out: [],
    }
    await act(async () => finish(stats))
    await act(async () => vi.advanceTimersByTimeAsync(250))
    expect(read).toHaveBeenCalledTimes(2)
    await act(async () => render(false))
    await act(async () => finish(stats))
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    expect(read).toHaveBeenCalledTimes(2)
  } finally {
    await act(async () => root.unmount())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  }
})
