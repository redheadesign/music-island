import { useEffect, useRef, useState, type CSSProperties, type Ref } from 'react'
import { createTranslator, type MessageKey } from '../../shared/i18n/messages'
import type { LocalServer } from '../../shared/lib/localServerTypes'
import type { Locale } from '../../shared/lib/types'
import { Button, Notice, SettingsIconButton } from '../../shared/ui/SettingsControls'
import { ArrowUpRight, Stop } from '../../shared/ui/SettingsIcons'
import './LocalServersPanel.css'

interface LocalServersPanelProps {
  servers: readonly LocalServer[]
  open?: (server: LocalServer) => Promise<void>
  stop?: (server: LocalServer) => Promise<void>
  locale: Locale
  contentScale: number
  preview?: boolean
  ref?: Ref<HTMLElement>
}

function addressOf(server: LocalServer): string {
  return `${server.host}:${server.port}`
}

export function LocalServersPanel({ servers, open, stop, locale, contentScale, preview = false, ref }: LocalServersPanelProps) {
  const t = createTranslator(locale)
  const [stopId, setStopId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const stopTriggerRef = useRef<HTMLButtonElement | null>(null)
  const selectedServer = servers.find((server) => server.id === stopId)
  const selectedId = selectedServer?.id

  useEffect(() => {
    if (selectedId) cancelRef.current?.focus({ preventScroll: true })
  }, [selectedId])

  const act = async (action: () => Promise<void>, errorKey: MessageKey) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch {
      setError(errorKey)
    } finally {
      setBusy(false)
    }
  }

  if (servers.length === 0) return null

  return (
    <section ref={ref} className={`island-local-servers island-surface${preview ? ' island-local-servers--preview' : ''}`}
      aria-label={t('localServers.title')} style={{ '--local-servers-content-scale': contentScale } as CSSProperties} inert={preview || undefined}>
      <ul className="island-local-servers__list">
        {servers.map((server) => {
          const address = addressOf(server)
          return (
            <li key={server.id} className="island-local-servers__row">
              <div className="island-local-servers__address">
                <code>{address}</code>
                <span title={server.processName}>{server.processName}</span>
              </div>
              <SettingsIconButton variant="ghost" size="compact" label={`${t('localServers.open')} · ${address}`} disabled={busy}
                onClick={open ? () => void act(() => open(server), 'localServers.openError') : undefined}>
                <ArrowUpRight size={16} aria-hidden="true" />
              </SettingsIconButton>
              {server.canStop ? <SettingsIconButton variant="ghost" size="compact" label={`${t('localServers.stop')} · ${address}`} disabled={busy}
                aria-expanded={stopId === server.id} onClick={stop ? (event) => {
                  stopTriggerRef.current = event.currentTarget
                  setStopId(server.id)
                  setError(null)
                } : undefined}>
                <Stop size={16} weight="fill" aria-hidden="true" />
              </SettingsIconButton> : null}
            </li>
          )
        })}
      </ul>
      {selectedServer && stop ? (
        <div className="island-local-servers__confirmation">
          <strong>{selectedServer.processName} · {addressOf(selectedServer)}</strong>
          <p>{t('localServers.stopHint')}</p>
          <div className="island-local-servers__confirmation-actions">
            <Button ref={cancelRef} variant="ghost" size="compact" disabled={busy} onClick={() => {
              setStopId(null)
              setError(null)
              stopTriggerRef.current?.focus({ preventScroll: true })
            }}>{t('consent.cancel')}</Button>
            <Button variant="danger" size="compact" disabled={busy} onClick={() => void act(async () => {
              await stop(selectedServer)
              setStopId(null)
            }, 'localServers.stopError')}>{t('localServers.confirm')}</Button>
          </div>
        </div>
      ) : null}
      {error ? <Notice tone="danger">{t(error)}</Notice> : null}
    </section>
  )
}
