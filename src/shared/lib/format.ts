export function formatTime(ms: number | null): string {
  if (!ms || ms < 0) {
    return '0:00'
  }

  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function getSourceLabel(sourceAppId: string | null): string {
  if (!sourceAppId) {
    return 'Windows SMTC'
  }

  const normalized = sourceAppId.toLowerCase()
  if (normalized.includes('chrome')) {
    return 'Chrome'
  }
  if (normalized.includes('edge')) {
    return 'Microsoft Edge'
  }
  if (normalized.includes('spotify')) {
    return 'Spotify'
  }

  return sourceAppId.replace(/!.*$/, '').replace(/\.exe$/i, '')
}
