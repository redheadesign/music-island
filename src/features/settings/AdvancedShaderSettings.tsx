import { useId, useState } from 'react'
import { getDictationAppearance } from '../../shared/lib/dictationAppearance'
import { dictationShaderDials, islandShaderDials, normalizeDictationShader, normalizeIslandShader, shaderOverrides } from '../../shared/lib/shaderTuning'
import type { AppConfig, Locale } from '../../shared/lib/types'
import { getInterfaceTheme, getUiPrefs, usesGlassMaterial, withUiPrefs } from '../../shared/lib/uiPrefs'
import { RangeSlider } from '../../shared/ui/RangeSlider'
import { Button } from '../../shared/ui/SettingsControls'
import { SettingsDisclosure } from '../../shared/ui/SettingsDisclosure'

const labels = {
  waveSpeed: ['Скорость волны', 'Wave speed'], waveIntensity: ['Яркость волны', 'Wave intensity'],
  waveBlur: ['Размытие волны', 'Wave blur'], waveReach: ['Радиус волны', 'Wave reach'],
  bassGain: ['Отклик на бас', 'Bass response'], particleCount: ['Количество', 'Count'],
  particleSpeed: ['Скорость падения', 'Fall speed'], particleSize: ['Размер', 'Size'],
  particleFall: ['Дальность падения', 'Fall distance'], particleBrightness: ['Яркость', 'Brightness'],
  foxSpeed: ['Скорость лисиц', 'Fox speed'], foxOpacity: ['Видимость поля', 'Field opacity'],
  waveBrightness: ['Яркость волн', 'Wave brightness'], lightIntensity: ['Свет материала', 'Material lighting'],
  amplitude: ['Амплитуда', 'Amplitude'], frequency: ['Частота', 'Frequency'], thickness: ['Толщина линии', 'Line width'],
  speed: ['Скорость движения', 'Motion speed'], dotRadius: ['Радиус частиц', 'Particle radius'],
  dotGlow: ['Свечение частиц', 'Particle glow'], foxBrightness: ['Яркость лисёнка', 'Fox brightness'],
} as const

type Key = keyof typeof labels
type ColorKey = 'waveColor' | 'particleColor'
const dials = { ...islandShaderDials, ...dictationShaderDials }
type Group = { title: [string, string]; fields: Key[]; color?: ColorKey }
const wave: Group = { title: ['Музыкальная волна', 'Music wave'], fields: ['waveSpeed', 'waveIntensity', 'waveBlur', 'waveReach', 'bassGain'], color: 'waveColor' }
const particles: Group = { title: ['Падающие частицы', 'Falling particles'], fields: ['particleCount', 'particleSpeed', 'particleSize', 'particleFall', 'particleBrightness'], color: 'particleColor' }
const foxField: Group = { title: ['Поле с лисицами', 'Fox field'], fields: ['foxSpeed', 'foxOpacity'] }
const units: Partial<Record<Key, string>> = {
  waveIntensity: '%', waveBlur: ' px', particleBrightness: '%', foxOpacity: '%', foxBrightness: '%', waveBrightness: '%', lightIntensity: '%',
}

export function AdvancedShaderSettings({ config, locale, onChange, scope }: {
  config: AppConfig; locale: Locale; onChange: (next: AppConfig) => void; scope: 'island' | 'dictation'
}) {
  const prefs = getUiPrefs(config)
  const appearance = getDictationAppearance(config)
  const island = scope === 'island'
  const values = island ? normalizeIslandShader(prefs.islandShader) : normalizeDictationShader(appearance.shaderTuning)
  const overrides = island ? shaderOverrides(prefs.islandShader, values) : appearance.shaderTuning ?? {}
  const lang = locale === 'ru' ? 0 : 1
  const groups: Group[] = []
  if (island) {
    if (usesGlassMaterial(config)) groups.push(wave, particles)
    groups.push(foxField)
  } else if (appearance.theme !== 'classic') {
    const classicMaterial = (appearance.materialTheme ?? getInterfaceTheme(config)) === 'classic'
    if (appearance.theme === 'wave') {
      groups.push({ title: ['Волны диктовки', 'Dictation waves'], fields: ['waveBrightness', 'speed', 'amplitude', 'frequency', 'thickness'] },
        { title: ['Частицы обработки', 'Processing particles'], fields: ['dotRadius', 'dotGlow'] })
    } else groups.push({ title: ['Лисёнок', 'Fox'], fields: ['foxBrightness'] })
    if (classicMaterial) groups.push({ title: ['Освещение капсулы', 'Capsule lighting'], fields: ['lightIntensity'] })
  }
  if (!groups.length) return null
  const change = (patch: Partial<Record<Key | ColorKey, number | string | null>>) => {
    const next = { ...overrides, ...patch }
    for (const [key, value] of Object.entries(next)) if (value == null) delete next[key as keyof typeof next]
    const saved = Object.keys(next).length ? next : undefined
    onChange(withUiPrefs(config, island
      ? { islandShader: saved && shaderOverrides(saved, normalizeIslandShader(saved)) }
      : { dictationAppearance: { ...appearance, shaderTuning: saved && shaderOverrides(saved, normalizeDictationShader(saved)) } }))
  }
  return <section className="glass-editor__section" aria-label={lang ? 'Shaders' : 'Шейдеры'}>
    <h3>{lang ? 'Shaders' : 'Шейдеры'}</h3>
    {groups.map(group => <ShaderGroup key={group.title[1]} group={group} locale={locale}
      values={values} overrides={overrides} onChange={change} />)}
  </section>
}

function ShaderGroup({ group, locale, values, overrides, onChange }: {
  group: Group; locale: Locale; values: Partial<Record<Key | ColorKey, number | string | null>>
  overrides: Partial<Record<Key | ColorKey, number | string | null>>
  onChange: (patch: Partial<Record<Key | ColorKey, number | string | null>>) => void
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const lang = locale === 'ru' ? 0 : 1
  const color = group.color
  const keys = color ? [...group.fields, color] : group.fields
  const changed = keys.some(key => Object.hasOwn(overrides, key))
  return <SettingsDisclosure title={group.title[lang]} summary={changed ? (lang ? 'Custom' : 'Свои значения') : undefined} onOpenChange={setOpen}>
    {open && <div className="glass-editor__fields">
      {group.fields.map(field => {
        const [min, max, step] = dials[field]
        const value = Number(values[field])
        const formatted = value.toLocaleString(locale, { maximumFractionDigits: 3 }) + (units[field] ?? '')
        return <div className="glass-editor__row" key={field}>
          <label htmlFor={id + field}>{labels[field][lang]}</label>
          <RangeSlider id={id + field} value={value} min={min} max={max} step={step} aria-valuetext={formatted}
            onChange={event => onChange({ [field]: event.currentTarget.valueAsNumber })} />
          <output htmlFor={id + field}>{formatted}</output>
        </div>
      })}
      {color && <div className="glass-editor__row" data-color>
        <label htmlFor={id + color}>{lang ? 'Color' : 'Цвет'}</label>
        <label className="glass-editor__color" htmlFor={id + color}>
          <span className="glass-editor__color-swatch" style={{ backgroundColor: String(values[color] ?? 'var(--accent)') }} />
          <span>{values[color] ?? (lang ? 'From artwork' : 'Из обложки')}</span>
          <input type="color" id={id + color} value={String(values[color] ?? '#ffffff')} onChange={event => onChange({ [color]: event.currentTarget.value })} />
        </label>
        {overrides[color] && <Button size="compact" variant="ghost" onClick={() => onChange({ [color]: null })}>{lang ? 'Auto' : 'Авто'}</Button>}
      </div>}
      <Button variant="ghost" size="compact" disabled={!changed} onClick={() => onChange(Object.fromEntries(keys.map(key => [key, null])))}>
        {lang ? 'Reset group' : 'Сбросить группу'}
      </Button>
    </div>}
  </SettingsDisclosure>
}
