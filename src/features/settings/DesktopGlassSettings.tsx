import { useId, useState } from 'react'
import { requestGlassBorderless } from '../../app/tauriApi'
import { normalizeDesktopGlassMode, normalizeDesktopLens } from '../../shared/lib/advancedGlass'
import type { AppConfig, Locale } from '../../shared/lib/types'
import { getUiPrefs, withUiPrefs } from '../../shared/lib/uiPrefs'
import { RangeSlider } from '../../shared/ui/RangeSlider'
import { Button } from '../../shared/ui/SettingsControls'
import { Select } from '../../shared/ui/Select'

export function DesktopGlassSettings({ config, locale, onChange }: {
  config: AppConfig
  locale: Locale
  onChange: (next: AppConfig) => void
}) {
  const id = useId()
  const ru = locale === 'ru'
  const prefs = getUiPrefs(config)
  const lens = normalizeDesktopLens(prefs.desktopLens)
  const mode = normalizeDesktopGlassMode(prefs.desktopGlassMode)
  const [access, setAccess] = useState<'idle' | 'pending' | 'allowed' | 'unavailable'>('idle')
  const label = ru ? 'Эффект стекла' : 'Glass effect'
  const fields = { bend: ru ? 'Преломление' : 'Refraction', dispersion: ru ? 'Дисперсия' : 'Dispersion' }

  const requestAccess = async () => {
    setAccess('pending')
    try {
      setAccess(await requestGlassBorderless() ? 'allowed' : 'unavailable')
    } catch {
      setAccess('unavailable')
    }
  }

  return <>
    <div className="ui-setting-row">
      <span className="ui-setting-row__copy">
        <strong>{label}</strong>
      </span>
      <Select ariaLabel={label} value={mode}
        onChange={value => onChange(withUiPrefs(config, { desktopGlassMode: normalizeDesktopGlassMode(value) }))}
        options={[
          { value: 'lens', label: ru ? 'GPU-линза' : 'GPU lens' },
          { value: 'snapshot', label: ru ? 'GPU-линза для записи' : 'GPU lens for recording' },
          { value: 'system', label: ru ? 'Системное стекло' : 'System glass' },
        ]} />
    </div>
    {mode !== 'system' && <div className="glass-editor__fields">
      <p>{mode === 'snapshot'
        ? (ru ? 'Островок виден в записи. Снимок фона обновляется при каждом открытии.' : 'The island appears in recordings. Its backdrop updates each time it opens.')
        : (ru ? 'Живой фон на Windows 11 24H2 и новее. Островок скрыт из записи и демонстрации экрана.' : 'Live backdrop on Windows 11 24H2 and later. The island is hidden from recordings and screen sharing.')}</p>
      {(Object.keys(fields) as (keyof typeof fields)[]).map(key => {
        const value = Math.round(lens[key] * 100)
        return <div className="glass-editor__row" key={key}>
          <label htmlFor={id + key}>{fields[key]}</label>
          <RangeSlider id={id + key} value={value} aria-valuetext={value + '%'}
            onChange={event => onChange(withUiPrefs(config, { desktopLens: { ...lens, [key]: event.currentTarget.valueAsNumber / 100 } }))} />
          <output aria-hidden="true">{value}%</output>
        </div>
      })}
      <Button variant="ghost" size="compact" disabled={access === 'pending'} onClick={() => void requestAccess()}>
        {ru ? 'Убрать рамку захвата' : 'Hide capture border'}
      </Button>
      {access === 'allowed' && <span role="status">{ru ? 'Windows разрешила захват без рамки' : 'Windows allowed borderless capture'}</span>}
      {access === 'unavailable' && <span role="status">{ru ? 'Windows не выдала отдельное разрешение. Рамка зависит от настроек системы.' : 'Windows did not grant separate permission. System settings control the capture border.'}</span>}
    </div>}
  </>
}
