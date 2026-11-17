import { progressFillColor } from '../overlay/artworkPalette'
import type { MediaSnapshot } from '../../shared/lib/types'
import previewRecord from '../../assets/preview-sea-stack.webp'

// Dominant palette sampled from the preview image with the same brightness
// factors used by the media island's artwork extraction.
export const APPEARANCE_PREVIEW_ARTWORK_THEME = {
  '--artwork-progress-color': progressFillColor([64, 76, 92]),
  '--artwork-primary': '64, 76, 92',
  '--artwork-secondary': '28, 34, 41',
} as const

export const APPEARANCE_PREVIEW_MEDIA: MediaSnapshot = {
  hasSession: true,
  sourceAppId: 'YandexMusic.exe',
  trackId: 'settings-preview',
  title: 'Still Water',
  artist: 'Music Island',
  albumTitle: null,
  playbackStatus: 'playing',
  positionMs: 73_000,
  durationMs: 214_000,
  canSeek: true,
  canGoNext: true,
  canGoPrevious: true,
  canPlay: true,
  canPause: true,
  canLike: true,
  canDislike: true,
  canShuffle: true,
  canRepeat: true,
  isShuffleActive: false,
  repeatMode: 'off',
  isLiked: false,
  isDisliked: false,
  activeWaveId: null,
  activeWaveTitle: null,
  thumbnailDataUrl: previewRecord,
  updatedAt: '2026-09-14T00:00:00Z',
  provider: 'yandex-direct',
  smtcHealth: 'healthy',
}

export const PREVIEW_COVER_PROGRESS = progressFillColor([168, 98, 55])
