import type { SessionSnapshot } from '../../features/plugins/voice/session'

let session: SessionSnapshot | null = null
export function resetVoiceSession(snapshot: SessionSnapshot | null = null) {
  session = snapshot ? structuredClone(snapshot) : null
}
export function loadSession() {
  return session
}
export function saveSession(next: SessionSnapshot) {
  session = structuredClone(next)
}
