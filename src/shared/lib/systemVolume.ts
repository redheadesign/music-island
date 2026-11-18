export interface SystemVolumeSnapshot {
  endpointId: string
  volume: number
  muted: boolean
}

export type SystemVolumeAction =
  | { kind: 'read' }
  | { kind: 'toggleMute'; endpointId: string }
  | { kind: 'setVolume'; endpointId: string; volume: number }
