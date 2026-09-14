import type { AudioStats } from '../features/plugins/voice/pluginApi'
import type { MediaSnapshot, SmtcHealthSnapshot } from '../shared/lib/types'

// Original, local artwork for deterministic previews; no remote image requests.
export const cover = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#f76100"/><stop offset="1" stop-color="#56243e"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="100" cy="100" r="67" fill="none" stroke="#ffd5b0" stroke-width="2"/><circle cx="100" cy="100" r="43" fill="none" stroke="#ffd5b0" stroke-width="16"/><circle cx="100" cy="100" r="5" fill="#ffd5b0"/></svg>')}`

export const media: MediaSnapshot = {
  hasSession: true,
  sourceAppId: 'YandexMusic.exe',
  trackId: 'workshop-track',
  title: 'Тёплый вечер',
  artist: 'Music Island Ensemble',
  albumTitle: 'After Hours',
  playbackStatus: 'playing',
  positionMs: 73000,
  durationMs: 214000,
  canSeek: true,
  canGoNext: true,
  canGoPrevious: true,
  canPlay: true,
  canPause: true,
  canLike: true,
  canDislike: true,
  canShuffle: true,
  isShuffleActive: false,
  canRepeat: true,
  repeatMode: 'off',
  isLiked: false,
  isDisliked: false,
  activeWaveId: null,
  activeWaveTitle: null,
  thumbnailDataUrl: cover,
  updatedAt: '2026-09-05T12:00:00Z',
  provider: 'yandex-direct',
  smtcHealth: 'healthy',
}

export const health: SmtcHealthSnapshot = {
  status: 'healthy',
  consecutiveFailures: 0,
  lastProbeMs: 0,
  lastError: null,
  sessionCount: 2,
}

export const audioStats: AudioStats = {
  input_level: -24,
  output_level: -18,
  input_peak: -18,
  post_gain_peak: -12,
  input_clipping: false,
  noise_reduction_db: 14,
  latency_ms: 18,
  cpu_usage: 2.4,
  frames_processed: 1200,
  frames_dropped: 0,
  spectrum: Array.from(
    { length: 64 },
    (_, i) =>
      0.08 + 0.65 * Math.exp(-i / 20) * (0.65 + 0.35 * Math.sin(i * 0.8) ** 2),
  ),
  spectrum_out: Array.from(
    { length: 64 },
    (_, i) =>
      0.025 + 0.55 * Math.exp(-i / 18) * (0.65 + 0.35 * Math.sin(i * 0.8) ** 2),
  ),
}
