import { useEffect, useId, useRef, useState } from 'react'
import {
  GLASS_NUMERIC_RANGES, GLASS_SURFACE_FIELDS, getSurfaceDefaults, normalizeAdvancedGlass, type AdvancedGlassOverrides,
  type GlassSurfaceId, type GlassSurfaceSettings,
} from '../../shared/lib/advancedGlass'
import type { GlassMaterial } from '../../shared/lib/glassMaterial'
import { serializeAppearancePreset } from '../../shared/lib/appearancePreset'
import type { AppConfig, Locale } from '../../shared/lib/types'
import { getUiPrefs, withUiPrefs } from '../../shared/lib/uiPrefs'
import { RangeSlider } from '../../shared/ui/RangeSlider'
import { Button, SettingsIconButton, Switch, Textarea } from '../../shared/ui/SettingsControls'
import { SettingsDisclosure } from '../../shared/ui/SettingsDisclosure'
import { RotateCcw } from '../../shared/ui/SettingsIcons'
import { AdvancedShaderSettings } from './AdvancedShaderSettings'
import './AdvancedGlassEditor.css'

type Names = Record<Locale, string>
type Scope = 'island' | 'dictation'
type Field = keyof GlassSurfaceSettings
type SurfaceOverrides = Partial<GlassSurfaceSettings>
type PageProps = { config: AppConfig; locale: Locale; onChange: (next: AppConfig) => void }

const surfaceNames = {
  body: { ru: 'Корпус островка', en: 'Island body' },
  transport: { ru: 'Воспроизведение и смена трека', en: 'Playback and track changes' },
  seek: { ru: 'Перемотка', en: 'Skip forward and back' },
  reactions: { ru: 'Лайк и дизлайк', en: 'Like and dislike' },
  modes: { ru: 'Перемешивание и повтор', en: 'Shuffle and repeat' },
  volume: { ru: 'Громкость', en: 'Volume' },
  actions: { ru: 'Кнопки островка и виджетов', en: 'Island and widget actions' },
  usage: { ru: 'Лимиты ИИ', en: 'Assistant limits' },
  localServers: { ru: 'Локальные серверы', en: 'Local servers' },
  latestDictation: { ru: 'Последняя диктовка', en: 'Latest dictation' },
  notices: { ru: 'Уведомления', en: 'Notices' },
  progressTrack: { ru: 'Подложка и название трека', en: 'Track background and title' },
  progressFill: { ru: 'Заливка прогресса', en: 'Progress fill' },
  dictation: { ru: 'Корпус капсулы', en: 'Capsule body' },
  dictationActions: { ru: 'Кнопки капсулы', en: 'Capsule actions' },
} satisfies Record<GlassSurfaceId, Names>

const islandSections: { title: Names; surfaces: GlassSurfaceId[] }[] = [
  { title: { ru: 'Плеер', en: 'Player' }, surfaces: ['body', 'transport', 'seek', 'reactions', 'modes', 'volume'] },
  { title: { ru: 'Строка проигрывания', en: 'Playback bar' }, surfaces: ['progressTrack', 'progressFill'] },
  { title: { ru: 'Кнопки и виджеты', en: 'Actions and widgets' }, surfaces: ['actions', 'usage', 'localServers', 'latestDictation', 'notices'] },
]
const capsuleSections: typeof islandSections = [
  { title: { ru: 'Капсула диктовки', en: 'Dictation capsule' }, surfaces: ['dictation', 'dictationActions'] },
]

const fieldNames = {
  bend: { ru: 'Преломление', en: 'Bend' },
  dispersion: { ru: 'Дисперсия', en: 'Dispersion' },
  frost: { ru: 'Размытие', en: 'Frost' },
  rim: { ru: 'Интенсивность кромки', en: 'Rim' },
  transparency: { ru: 'Прозрачность', en: 'Transparency' },
  parallax: { ru: 'Параллакс', en: 'Parallax' },
  highlight: { ru: 'Яркость блика', en: 'Highlight' },
  edge: { ru: 'Толщина кромки', en: 'Edge thickness' },
  background: { ru: 'Цвет подложки', en: 'Background color' },
  text: { ru: 'Текст и значки', en: 'Text and icons' },
  endColor: { ru: 'Конец градиента', en: 'Gradient end' },
  angle: { ru: 'Угол градиента', en: 'Gradient angle' },
  radius: { ru: 'Скругление', en: 'Corner radius' },
  height: { ru: 'Высота', en: 'Height' },
  textSize: { ru: 'Размер текста', en: 'Text size' },
} satisfies Record<Field, Names>

export function AdvancedGlassSwitch({ config, locale, onChange }: PageProps) {
  const prefs = getUiPrefs(config)
  if (prefs.developerMode !== true) return null
  return <Switch label={locale === 'ru' ? 'Продвинутые настройки' : 'Advanced settings'}
    checked={prefs.glassAdvancedEnabled === true}
    onChange={glassAdvancedEnabled => onChange(withUiPrefs(config, { glassAdvancedEnabled }))} />
}

export function AdvancedGlassEditor({ config, locale, onChange, scope, base, hasGlass }: PageProps & {
  scope: Scope; base: GlassMaterial; hasGlass: boolean
}) {
  const prefs = getUiPrefs(config)
  if (prefs.developerMode !== true) return null
  const overrides = normalizeAdvancedGlass(prefs.advancedGlass)
  const update = (surface: GlassSurfaceId, patch?: SurfaceOverrides) => {
    const next: AdvancedGlassOverrides = { ...overrides }
    if (patch && Object.keys(patch).length) next[surface] = patch
    else delete next[surface]
    onChange(withUiPrefs(config, { advancedGlass: Object.keys(next).length ? next : undefined }))
  }
  return <div className="glass-editor">
    <div className="glass-editor__toolbar">
      <AdvancedGlassSwitch config={config} locale={locale} onChange={onChange} />
      {prefs.glassAdvancedEnabled === true && <PresetCopy config={config} locale={locale} />}
    </div>
    {prefs.glassAdvancedEnabled === true && <>
      {hasGlass && (scope === 'island' ? islandSections : capsuleSections).map(({ title, surfaces }) => (
        <section key={title.en} className="glass-editor__section" aria-label={title[locale]}>
          <h3>{title[locale]}</h3>
          {surfaces.map(surface => <SurfaceEditor key={surface} surface={surface} base={base}
            locale={locale} saved={overrides[surface]} onChange={next => update(surface, next)} />)}
        </section>
      ))}
      <AdvancedShaderSettings config={config} locale={locale} onChange={onChange} scope={scope} />
    </>}
  </div>
}

function PresetCopy({ config, locale }: Pick<PageProps, 'config' | 'locale'>) {
  const [result, setResult] = useState<{ status: 'copied' | 'manual'; config: AppConfig; json?: string }>()
  const fallback = useRef<HTMLLabelElement>(null)
  const current = result?.config === config ? result : undefined
  const ru = locale === 'ru'
  useEffect(() => {
    if (current?.status === 'manual') fallback.current?.querySelector('textarea')?.focus()
  }, [current])
  const copy = async () => {
    const json = serializeAppearancePreset(config)
    try {
      await navigator.clipboard.writeText(json)
      setResult({ status: 'copied', config })
    } catch {
      setResult({ status: 'manual', config, json })
    }
  }
  return <>
    <Button variant="ghost" size="compact" onClick={() => void copy()}>
      {ru ? 'Скопировать JSON' : 'Copy JSON'}
    </Button>
    {current?.status === 'copied' && <span role="status">{ru ? 'Скопировано' : 'Copied'}</span>}
    {current?.status === 'manual' && <label className="glass-editor__copy-fallback" ref={fallback}>
      <span>{ru ? 'Нажмите Ctrl+C, чтобы скопировать JSON' : 'Press Ctrl+C to copy the JSON'}</span>
      <Textarea className="glass-editor__export" value={current.json} readOnly rows={4}
        onFocus={event => event.currentTarget.select()} />
    </label>}
  </>
}

function SurfaceEditor({ surface, base, locale, saved = {}, onChange }: {
  surface: GlassSurfaceId; base: GlassMaterial; locale: Locale; saved?: SurfaceOverrides
  onChange: (next?: SurfaceOverrides) => void
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const ru = locale === 'ru'
  const title = surfaceNames[surface][locale]
  const defaults = getSurfaceDefaults(surface, base)
  const custom = Object.keys(saved).length > 0
  const resetField = (field: Field) => {
    const next = { ...saved }
    delete next[field]
    onChange(next)
  }
  return <SettingsDisclosure title={title}
    summary={custom ? (ru ? 'Свои значения' : 'Custom') : undefined} onOpenChange={setOpen}>
    {open && <div className="glass-editor__fields" role="group" aria-label={title}>
      {GLASS_SURFACE_FIELDS[surface].map(field => {
        const inputId = id + field
        const label = surface === 'progressFill' && field === 'background'
          ? (ru ? 'Начало градиента' : 'Gradient start') : fieldNames[field][locale]
        const reset = ru ? `Сбросить «${label}»` : `Reset ${label}`
        const changed = saved[field] !== undefined
        const color = field === 'background' || field === 'text' || field === 'endColor'
        let editor
        if (color) {
          const value = saved[field] ?? defaults[field]
          editor = <label className="glass-editor__color" htmlFor={inputId}>
            <span className="glass-editor__color-swatch" style={{ backgroundColor: value }} />
            <span>{changed ? value.toUpperCase() : (ru ? 'Авто' : 'Auto')}</span>
            <input type="color" id={inputId} aria-label={label} value={value}
              onChange={event => onChange({ ...saved, [field]: event.currentTarget.value })} />
          </label>
        } else {
          const { min, max, step, unit } = GLASS_NUMERIC_RANGES[field]
          const value = saved[field] ?? defaults[field]
          const displayed = value.toLocaleString(locale, { maximumFractionDigits: 2 }) + (unit === 'px' ? ' px' : unit)
          editor = <>
            <RangeSlider id={inputId} min={min} max={max} step={step} value={value} aria-valuetext={displayed}
              onChange={event => onChange({ ...saved, [field]: event.currentTarget.valueAsNumber })} />
            <output aria-hidden="true">{displayed}</output>
          </>
        }
        return <div key={field} className="glass-editor__row">
          <label htmlFor={inputId}>{label}</label>{editor}
          <SettingsIconButton label={reset} className="glass-editor__reset" variant="ghost" size="compact"
            disabled={!changed} onClick={event => {
              event.currentTarget.closest('.glass-editor__row')?.querySelector('input')?.focus({ preventScroll: true })
              resetField(field)
            }}><RotateCcw size={14} aria-hidden="true" /></SettingsIconButton>
        </div>
      })}
      <Button variant="ghost" size="compact" className="glass-editor__group-reset" disabled={!custom}
        onClick={event => {
          event.currentTarget.closest('details')?.querySelector('summary')?.focus({ preventScroll: true })
          onChange()
        }}>{ru ? 'Сбросить группу' : 'Reset group'}</Button>
    </div>}
  </SettingsDisclosure>
}
