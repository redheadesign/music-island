import { artworkCssColors, progressFillColor } from '../overlay/artworkPalette'
import type { MediaSnapshot } from '../../shared/lib/types'
import previewRecord from '../../assets/preview-sea-stack.webp'

// Sampled by readArtworkPalette from preview-sea-stack.webp. The workshop
// checks the source image so a replacement also refreshes these samples.
const previewPalette = { primary: [106, 118, 139], secondary: [71, 89, 113] } as const
const progressColor = progressFillColor(previewPalette.primary)

export function getPreviewArtworkStyle(glass: boolean) {
  const colors = artworkCssColors(previewPalette, glass)
  return {
    '--artwork-progress-color': progressColor,
    '--artwork-primary': colors.primary,
    '--artwork-secondary': colors.secondary,
  }
}

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
