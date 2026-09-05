import {
  AudioLines,
  Headphones,
  Mic2,
  SlidersHorizontal,
  Volume2,
  Waves,
  X,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { AGC_CALLS_RMS, AGC_CONTENT_RMS, dbToLinear, linearToDb } from './levels'
import { EXPLODE_EFFECTS, sceneLabel } from './presets'
import { DarkSelect } from './DarkSelect'
import { useIslandVoiceApp } from './useIslandVoiceApp'
import { FOX_CLIP_CATALOG, VoiceFoxMascot, type FoxClipId } from './VoiceFoxMascot'
import { VoiceGuidePage } from './VoiceGuidePage'
import { VoiceLiveMeters } from './VoiceLiveMeters'
import { GlassSurface } from '../../../shared/ui/GlassSurface'
import { RangeSlider } from '../../../shared/ui/RangeSlider'
import { createTranslator } from '../../../shared/i18n/messages'
import { openExternalUrl } from '../../../app/tauriApi'
import type { Locale } from '../../../shared/lib/types'

interface VoiceSettingsViewProps {
  locale: Locale
  /** False while Settings is hidden or another tab is active — pause fox / meters. */
  active?: boolean
  developerMode?: boolean
  showExperimentalBanner?: boolean
  onDismissExperimentalBanner?: () => void
}

const AGC_EPS = 0.004
const CABLE_SITE = 'https://vb-audio.com/Cable/'

export function VoiceSettingsView({
  locale,
  active = true,
  developerMode = false,
  showExperimentalBanner = true,
  onDismissExperimentalBanner,
}: VoiceSettingsViewProps) {
  const app = useIslandVoiceApp(locale, { active })
  const { t } = app
  const ti = createTranslator(locale)
  const [guideOpen, setGuideOpen] = useState(false)
  const [foxPreviewId, setFoxPreviewId] = useState<FoxClipId | null>(null)
  const foxPreviewLabel = useMemo(
    () => FOX_CLIP_CATALOG.find((clip) => clip.id === foxPreviewId)?.label ?? null,
    [foxPreviewId],
  )
  const agcDb = linearToDb(app.agcTarget)
  const freqs = app.eqFreqs.length
    ? app.eqFreqs
    : [60, 150, 250, 400, 800, 1500, 2500, 4000, 8000, 12000]

  const agcChip = near(app.agcTarget, AGC_CALLS_RMS)
    ? 'calls'
    : near(app.agcTarget, AGC_CONTENT_RMS)
      ? 'content'
      : 'custom'

  const meterTarget = app.agcEnabled
    ? agcChip === 'custom'
      ? 'custom'
      : agcChip
    : 'custom'

  const outputHint = /cable input/i.test(app.outputDevice)
    ? t.outputHintCable
    : t.outputHintNeedCable

  if (guideOpen) {
    return (
      <VoiceGuidePage
        locale={locale}
        onBack={() => setGuideOpen(false)}
        openCableSiteLabel={t.openCableSite}
        onOpenCableSite={() => void openExternalUrl(CABLE_SITE)}
      />
    )
  }

  return (
    <div className="voice-settings" aria-busy={!app.hydrated}>
      <section className="voice-control-hero" aria-label={t.start}>
        <div className="voice-fx-row voice-fx-row--center">
          {EXPLODE_EFFECTS.map((fx) => (
            <button
              key={fx.value}
              type="button"
              className={`voice-chip ${app.fxEnabled && app.fxEffect === fx.value ? 'voice-chip--active' : ''}`}
              disabled={!app.running}
              onClick={() => void app.toggleFx(fx.value)}
            >
              {locale === 'ru' ? fx.labelRu : fx.labelEn}
            </button>
          ))}
          <button
            type="button"
            className={[
              'voice-chip',
              'voice-chip--monitor',
              app.monitorEnabled ? 'voice-chip--active' : '',
            ].filter(Boolean).join(' ')}
            aria-pressed={app.monitorEnabled}
            onClick={() => void app.applyMonitor(!app.monitorEnabled)}
          >
            <Headphones size={14} aria-hidden />
            <span>{t.monitor}</span>
          </button>
        </div>
        {app.fxEnabled ? (
          <label className="settings-control-row voice-fx-intensity">
            <span><strong>{t.fxIntensity}</strong></span>
            <div className="range-control">
              <RangeSlider
                min={1}
                max={100}
                value={app.fxIntensity}
                disabled={!app.running}
                onChange={(e) => void app.applyFxIntensity(Number(e.currentTarget.value))}
              />
              <output>{app.fxIntensity}%</output>
            </div>
          </label>
        ) : null}

        <VoiceFoxMascot
          live={app.running}
          active={active}
          previewClipId={developerMode ? foxPreviewId : null}
        />

        {developerMode ? (
          <div className="fox-dev-preview" data-tauri-drag-region="false">
            <code className="fox-dev-preview__name" title={foxPreviewLabel ?? undefined}>
              {foxPreviewLabel ?? ti('settings.devFoxClipDefault')}
            </code>
            <label className="fox-dev-preview__field">
              <span>{ti('settings.devFoxClip')}</span>
              <select
                className="fox-dev-preview__select"
                value={foxPreviewId ?? ''}
                onChange={(e) => {
                  const next = e.currentTarget.value
                  setFoxPreviewId(next ? (next as FoxClipId) : null)
                }}
              >
                <option value="">{ti('settings.devFoxClipAuto')}</option>
                <optgroup label={ti('settings.devFoxGroupLive')}>
                  {FOX_CLIP_CATALOG.filter((clip) => clip.group === 'live').map((clip) => (
                    <option key={clip.id} value={clip.id}>{clip.label}</option>
                  ))}
                </optgroup>
                <optgroup label={ti('settings.devFoxGroupSleep')}>
                  {FOX_CLIP_CATALOG.filter((clip) => clip.group === 'sleep').map((clip) => (
                    <option key={clip.id} value={clip.id}>{clip.label}</option>
                  ))}
                </optgroup>
                <optgroup label={ti('settings.devFoxGroupTransition')}>
                  {FOX_CLIP_CATALOG.filter((clip) => clip.group === 'transition').map((clip) => (
                    <option key={clip.id} value={clip.id}>{clip.label}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            {foxPreviewId ? (
              <button
                type="button"
                className="secondary-button fox-dev-preview__reset"
                onClick={() => setFoxPreviewId(null)}
              >
                {ti('settings.devFoxClipReset')}
              </button>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          className={['voice-control-cta', app.running ? 'voice-control-cta--stop' : 'voice-control-cta--start'].join(' ')}
          disabled={app.busy || !app.hydrated}
          onClick={() => void (app.running ? app.stop() : app.start())}
        >
          {app.running ? t.stop : t.start}
        </button>
        {app.error ? <p className="voice-settings-error">{app.error}</p> : null}
      </section>

      {showExperimentalBanner ? (
        <div className="voice-experimental-banner" role="status">
          <p className="voice-experimental-banner__text">
            {ti('settings.voiceExperimental')}
            <button
              type="button"
              className="voice-experimental-banner__link"
              onClick={() => setGuideOpen(true)}
            >
              {ti('settings.voiceExperimentalLink')}
            </button>
            .
          </p>
          {onDismissExperimentalBanner ? (
            <button
              type="button"
              className="voice-experimental-banner__close"
              aria-label={ti('settings.voiceExperimentalClose')}
              onClick={onDismissExperimentalBanner}
            >
              <X size={14} aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}

      <VoiceSection title={t.sectionDevices} icon={<Mic2 size={16} />}>
        <div className="voice-device-stack">
          <DeviceSelect icon={<Mic2 size={14} />} label={t.input} value={app.inputDevice} options={app.inputs} onChange={app.setInputDevice} />
          <DeviceSelect icon={<AudioLines size={14} />} label={t.output} value={app.outputDevice} options={app.outputs} onChange={app.setOutputDevice} />
        </div>
        <p className="voice-settings-hint">{outputHint}</p>

        <VoiceLiveMeters
          running={app.running}
          active={active}
          targetKind={meterTarget}
          overloadLabel={t.inputOverload}
          comfortTip={t.meterComfortTip}
          yellTip={t.meterYellTip}
          targetTip={
            locale === 'ru'
              ? 'Целевой уровень после усиления'
              : 'Target level after gain'
          }
        />
      </VoiceSection>

      <VoiceSection
        title={t.sectionNoise}
        icon={<Waves size={16} />}
        action={(
          <HeaderSwitch
            label={t.noise}
            checked={app.enabled}
            onChange={(checked) => void app.applyEnabled(checked)}
          />
        )}
      >
        <label className="settings-control-row">
          <span><strong>{t.strength}</strong></span>
          <div className="range-control">
            <RangeSlider min={0} max={100} value={app.strength} onChange={(e) => void app.applyStrength(Number(e.currentTarget.value))} />
            <output>{app.strength}%</output>
          </div>
        </label>
        <label className="settings-control-row">
          <span><strong>{t.model}</strong></span>
          <DarkSelect
            ariaLabel={t.model}
            value={app.model}
            options={app.models.map((model) => ({ value: model, label: prettyModel(model) }))}
            onChange={(next) => void app.applyModel(next)}
          />
        </label>
      </VoiceSection>

      <VoiceSection
        title={t.sectionGain}
        icon={<Volume2 size={16} />}
        action={(
          <div className="voice-segment-switch" role="group" aria-label={t.gainMode}>
            <button type="button" className={!app.agcEnabled ? 'is-active' : ''} onClick={() => void app.applyAgcEnabled(false)}>{t.gainManual}</button>
            <button type="button" className={app.agcEnabled ? 'is-active' : ''} onClick={() => void app.applyAgcEnabled(true)}>{t.gainAuto}</button>
          </div>
        )}
      >
        {app.agcEnabled ? (
          <>
            <p className="voice-settings-hint">{t.gainAutoHint}</p>
            <div className="voice-chip-row">
              <button type="button" className={`voice-chip ${agcChip === 'calls' ? 'voice-chip--active' : ''}`} onClick={() => void app.applyAgcTarget(AGC_CALLS_RMS)}>{t.gainTargetCalls}</button>
              <button type="button" className={`voice-chip ${agcChip === 'content' ? 'voice-chip--active' : ''}`} onClick={() => void app.applyAgcTarget(AGC_CONTENT_RMS)}>{t.gainTargetContent}</button>
              <button type="button" className={`voice-chip ${agcChip === 'custom' ? 'voice-chip--active' : ''}`} onClick={() => { if (agcChip !== 'custom') void app.applyAgcTarget(0.05) }}>{t.gainTargetCustom}</button>
            </div>
            <label className="settings-control-row">
              <span><strong>{t.agcTarget}</strong></span>
              <div className={['range-control', agcChip !== 'custom' ? 'range-control--preset' : ''].filter(Boolean).join(' ')}>
                <RangeSlider
                  min={-40}
                  max={0}
                  value={agcDb}
                  onChange={(e) => void app.applyAgcTarget(dbToLinear(Number(e.currentTarget.value)))}
                />
                <output>{agcDb.toFixed(0)} dB</output>
              </div>
            </label>
          </>
        ) : (
          <label className="settings-control-row">
            <span><strong>{t.micGain}</strong></span>
            <div className="range-control">
              <RangeSlider min={50} max={400} value={Math.round(app.micGain * 100)} onChange={(e) => void app.applyMicGain(Number(e.currentTarget.value) / 100)} />
              <output>{Math.round(app.micGain * 100)}%</output>
            </div>
          </label>
        )}
      </VoiceSection>

      <VoiceSection
        title={t.eq}
        icon={<SlidersHorizontal size={16} />}
        action={(
          <HeaderSwitch
            label={t.eq}
            checked={app.eqEnabled}
            onChange={(checked) => void app.applyEqEnabled(checked)}
          />
        )}
      >
        <div className={`voice-eq ${app.eqEnabled ? '' : 'voice-eq--off'}`}>
          <div className="voice-chip-row">
            {app.presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`voice-chip ${app.presetId === preset.id ? 'voice-chip--active' : ''}`}
                disabled={!app.eqEnabled}
                onClick={() => void app.applyScene(preset)}
              >
                {sceneLabel(preset, locale)}
              </button>
            ))}
          </div>
          <div className="voice-eq-bands">
            {app.eqBands.map((gain, index) => (
              <label key={index} className="voice-eq-band">
                <RangeSlider
                  min={-12}
                  max={12}
                  step={0.5}
                  value={gain}
                  disabled={!app.eqEnabled}
                  onChange={(e) => {
                    const next = [...app.eqBands]
                    next[index] = Number(e.currentTarget.value)
                    void app.applyEqBands(next)
                  }}
                />
                <span>{formatHz(freqs[index] ?? 0)}</span>
              </label>
            ))}
          </div>
        </div>
      </VoiceSection>

      <VoiceSection title={t.settings} icon={<AudioLines size={16} />}>
        <p className="voice-settings-hint">
          {app.virtualRoute.cableInstalled ? t.cableReady : t.cableNeed}
        </p>
        <div className="voice-settings-actions">
          <button type="button" className="secondary-button" onClick={() => setGuideOpen(true)}>
            {t.installCableRun}
          </button>
          <button type="button" className="secondary-button" onClick={() => void openExternalUrl(CABLE_SITE)}>
            {t.openCableSite}
          </button>
        </div>
      </VoiceSection>
    </div>
  )
}

function VoiceSection({
  title,
  icon,
  children,
  action,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <GlassSurface as="section" className="settings-section voice-settings-card">
      <header className="settings-section-header">
        <div className="settings-section-title">
          {icon}
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      <div className="voice-section-body">{children}</div>
    </GlassSurface>
  )
}

function HeaderSwitch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      className={['ui-switch', checked ? 'ui-switch--on' : ''].filter(Boolean).join(' ')}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span className="ui-switch__thumb" aria-hidden="true" />
    </button>
  )
}

function DeviceSelect({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: ReactNode
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="settings-control-row">
      <span>
        <strong className="inline-flex">{icon} {label}</strong>
      </span>
      <DarkSelect
        ariaLabel={label}
        value={value}
        options={options.map((device) => ({ value: device, label: device }))}
        onChange={onChange}
      />
    </label>
  )
}

function prettyModel(model: string) {
  if (/deepfilter/i.test(model)) return 'DeepFilterNet'
  if (/rnnoise/i.test(model)) return 'RNNoise'
  return model
}

function formatHz(hz: number) {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)}k`
  return `${Math.round(hz)}`
}

function near(a: number, b: number) {
  return Math.abs(a - b) < AGC_EPS
}
