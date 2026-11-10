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
  stopAll?: (servers: readonly LocalServer[]) => Promise<void>
  locale: Locale
  contentScale: number
  preview?: boolean
  ref?: Ref<HTMLElement>
}

type StopRequest = { kind: 'single'; id: string } | { kind: 'all'; servers: readonly LocalServer[] }

function addressOf(server: LocalServer): string {
  return `${server.host}:${server.port}`
}

export function LocalServersPanel({ servers, open, stop, stopAll, locale, contentScale, preview = false, ref }: LocalServersPanelProps) {
  const t = createTranslator(locale)
  const [stopRequest, setStopRequest] = useState<StopRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const stopTriggerRef = useRef<HTMLButtonElement | null>(null)
  const stopId = stopRequest?.kind === 'single' ? stopRequest.id : null
  const selectedServer = servers.find((server) => server.id === stopId)
  const bulkRequest = stopRequest?.kind === 'all' ? stopRequest : null
  const confirmationKey = bulkRequest ? 'all' : selectedServer?.id
  const canStopAll = servers.every((server) => server.canStop)

  useEffect(() => {
    if (confirmationKey) cancelRef.current?.focus({ preventScroll: true })
  }, [confirmationKey])

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

  const requestStop = (request: StopRequest, trigger: HTMLButtonElement) => {
    stopTriggerRef.current = trigger
    setStopRequest(request)
    setError(null)
  }

  const confirmStop = () => {
    if (bulkRequest && stopAll) {
      const activeIds = new Set(servers.map((server) => server.id))
      const targets = bulkRequest.servers.filter((server) => activeIds.has(server.id))
      void act(async () => {
        try {
          await stopAll(targets)
        } finally {
          setStopRequest(null)
        }
      }, 'localServers.stopAllError')
    } else if (selectedServer && stop) {
      void act(async () => {
        await stop(selectedServer)
        setStopRequest(null)
      }, 'localServers.stopError')
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
                aria-expanded={stopId === server.id}
                onClick={stop ? (event) => requestStop({ kind: 'single', id: server.id }, event.currentTarget) : undefined}>
                <Stop size={16} weight="fill" aria-hidden="true" />
              </SettingsIconButton> : null}
            </li>
          )
        })}
      </ul>
      {servers.length > 1 && (stopAll || preview) ? (
        <div className="island-local-servers__bulk">
          <Button variant="ghost" size="compact" disabled={busy || !canStopAll} aria-expanded={Boolean(bulkRequest)}
            title={canStopAll ? undefined : t('localServers.stopAllUnavailable')}
            onClick={stopAll ? (event) => requestStop({ kind: 'all', servers }, event.currentTarget) : undefined}>
            {t('localServers.stopAll')}
          </Button>
        </div>
      ) : null}
      {(bulkRequest && stopAll) || (selectedServer && stop) ? (
        <div className="island-local-servers__confirmation">
          <strong>{bulkRequest ? t('localServers.stopAllConfirm') : selectedServer && `${selectedServer.processName} · ${addressOf(selectedServer)}`}</strong>
          <p>{t(bulkRequest ? 'localServers.stopAllHint' : 'localServers.stopHint')}</p>
          <div className="island-local-servers__confirmation-actions">
            <Button ref={cancelRef} variant="ghost" size="compact" disabled={busy} onClick={() => {
              setStopRequest(null)
              setError(null)
              stopTriggerRef.current?.focus({ preventScroll: true })
            }}>{t('consent.cancel')}</Button>
            <Button variant="danger" size="compact" disabled={busy} onClick={confirmStop}>
              {t(bulkRequest ? 'localServers.confirmAll' : 'localServers.confirm')}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <Notice tone="danger">{t(error)}</Notice> : null}
    </section>
  )
}
