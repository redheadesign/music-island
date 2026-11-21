import { useId } from 'react'
import { normalizeDesktopLens } from '../../shared/lib/advancedGlass'
import type { AppConfig, Locale } from '../../shared/lib/types'
import { getUiPrefs, withUiPrefs } from '../../shared/lib/uiPrefs'
import { RangeSlider } from '../../shared/ui/RangeSlider'
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
  const experimental = prefs.desktopGlassMode === 'lens'
  const label = ru ? 'Эффект стекла' : 'Glass effect'
  const fields = { bend: ru ? 'Преломление' : 'Refraction', dispersion: ru ? 'Дисперсия' : 'Dispersion' }

  return <section className="glass-editor" aria-label={label}>
    <div className="ui-setting-row">
      <span className="ui-setting-row__copy">
        <strong>{label}</strong>
        <small>{ru ? 'Для корпуса островка в теме «Стекло».' : 'For the island body in the Glass theme.'}</small>
      </span>
      <Select ariaLabel={label} value={experimental ? 'lens' : 'system'}
        onChange={value => onChange(withUiPrefs(config, { desktopGlassMode: value === 'lens' ? 'lens' : 'system' }))}
        options={[
          { value: 'system', label: ru ? 'Системное стекло' : 'System glass' },
          { value: 'lens', label: ru ? 'GPU-линза · эксперимент' : 'GPU lens · experimental' },
        ]} />
    </div>
    {experimental && <div className="glass-editor__fields">
      <p>{ru
        ? 'Windows 11 24H2 и новее. Фон обрабатывается на видеокарте, пока островок открыт. В этом режиме корпус и кнопки островка скрыты в записи и демонстрации экрана.'
        : 'Windows 11 24H2 and later. The GPU processes the background while the island is open. The island is hidden in screen recordings and screen sharing in this mode.'}</p>
      {(Object.keys(fields) as (keyof typeof fields)[]).map(key => {
        const value = Math.round(lens[key] * 100)
        return <div className="glass-editor__row" key={key}>
          <label htmlFor={id + key}>{fields[key]}</label>
          <RangeSlider id={id + key} value={value} aria-valuetext={value + '%'}
            onChange={event => onChange(withUiPrefs(config, { desktopLens: { ...lens, [key]: event.currentTarget.valueAsNumber / 100 } }))} />
          <output aria-hidden="true">{value}%</output>
        </div>
      })}
    </div>}
  </section>
}
