import type { AppConfig } from '../../shared/lib/types'

export const layoutPresets: Record<AppConfig['layout']['preset'], Partial<AppConfig['layout']>> = {
  'clean-controls': {
    density: 'buttons-only',
    showArtwork: false,
    showTitle: false,
    showArtist: false,
    showProgress: false,
    showSource: false,
    showPreviousNext: true,
  },
  'album-pill': {
    density: 'balanced',
    showArtwork: true,
    showTitle: true,
    showArtist: true,
    showProgress: true,
    showSource: true,
    showPreviousNext: true,
  },
  'now-playing-rich': {
    density: 'rich',
    showArtwork: true,
    showTitle: true,
    showArtist: true,
    showProgress: true,
    showSource: true,
    showPreviousNext: true,
  },
  'focus-mode': {
    density: 'minimal',
    showArtwork: false,
    showTitle: true,
    showArtist: false,
    showProgress: true,
    showSource: false,
    showPreviousNext: false,
  },
}

export function applyLayoutPreset(
  config: AppConfig,
  preset: AppConfig['layout']['preset'],
): AppConfig {
  return {
    ...config,
    layout: {
      ...config.layout,
      ...layoutPresets[preset],
      preset,
    },
  }
}
