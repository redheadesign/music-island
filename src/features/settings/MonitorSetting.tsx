import { useEffect, useState } from 'react'
import { getMonitorSnapshot, onMonitorsChanged } from '../../app/tauriApi'
import type { Locale, MonitorSnapshot } from '../../shared/lib/types'
import { Button, Notice, SettingRow } from '../../shared/ui/SettingsControls'
import { Select } from '../../shared/ui/Select'

export function MonitorSetting({ value, onChange, locale }: { value: string | null; onChange: (value: string | null) => void; locale: Locale }) {
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const ru = locale === 'ru'
  useEffect(() => {
    let active = true
    let dispose = () => {}
    const accept = (next: MonitorSnapshot) => { if (active) { setError(false); setSnapshot(current => current && current.revision > next.revision ? current : next) } }
    void onMonitorsChanged(accept).then(async unlisten => {
      if (!active) { unlisten(); return }
      dispose = unlisten
      accept(await getMonitorSnapshot())
    }).catch(() => { if (active) setError(true) })
    return () => { active = false; dispose() }
  }, [attempt])
  const missing = Boolean(snapshot && value && !snapshot.monitors.some(m => m.id === value))
  const options = [{ value: '', label: ru ? 'Основной монитор' : 'Primary display' },
    ...(snapshot?.monitors ?? []).map(m => ({ value: m.id, label: `${m.name} · ${m.width} × ${m.height}${m.primary ? ru ? ' · Основной' : ' · Primary' : ''}` })),
    ...(missing ? [{ value: value!, label: ru ? 'Монитор не подключён' : 'Display disconnected' }] : [])]
  const label = ru ? 'Монитор островка' : 'Island display'
  return <>
    <SettingRow label={label} hint={missing ? ru ? 'Пока островок на основном мониторе.' : 'Using the primary display for now.' : undefined}>
      <Select ariaLabel={label} value={value ?? ''} options={options} onChange={next => onChange(next || null)} disabled={!snapshot || error} />
    </SettingRow>
    {error ? (
      <Notice tone="danger" compact action={
        <Button size="compact" onClick={() => setAttempt(value => value + 1)}>{ru ? 'Повторить' : 'Retry'}</Button>
      }>
        {ru ? 'Не удалось загрузить список мониторов.' : 'Could not load the list of displays.'}
      </Notice>
    ) : null}
  </>
}
