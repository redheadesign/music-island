import type { DictationController } from '../../app/useIslandApp'
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Switch } from '../../shared/ui/SettingsControls'
import { StatefulWarpSurface } from '../../shared/ui/StatefulWarpSurface'
import { DictationOverlayView } from './DictationOverlay'
import { defaultDictationAppearance, type DictationAppearance } from '../../shared/lib/dictationAppearance'
import type { ShortcutActivation } from '../../shared/lib/dictationTypes'
import type { AppConfig } from '../../shared/lib/types'
import { getGlassMaterial, type GlassMaterial } from '../../shared/lib/glassMaterial'
import { getUiPrefs, getInterfacePalette, getInterfacePaletteStyle, getInterfaceTheme } from '../../shared/lib/uiPrefs'
import './DictationPreview.css'

export function DictationPreview({ controller: c, config, locale, active, reducedMotion, appearance = defaultDictationAppearance, glassMaterial = getGlassMaterial(config), onEnable, onDisable }: {
  controller: DictationController; locale: 'ru' | 'en'; active: boolean; reducedMotion: boolean
  onEnable: () => Promise<void>; onDisable?: () => Promise<void>
  appearance?: DictationAppearance
  config?: AppConfig
  glassMaterial?: GlassMaterial
}) {
  const ru = locale === 'ru'
  const systemReducedMotion = useReducedMotion()
  const still = reducedMotion || Boolean(systemReducedMotion)
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  const anchor = useRef<HTMLSpanElement>(null)
  const [pinned, setPinned] = useState(false)
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  useEffect(() => {
    const marker = anchor.current
    const root = marker?.closest<HTMLElement>('[data-settings-scroll]')
    if (!marker || !root || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      setPinned(!entry.isIntersecting && entry.boundingClientRect.bottom <= root.getBoundingClientRect().top)
    }, { root })
    observer.observe(marker)
    return () => observer.disconnect()
  }, [])
  return <section className="dictation-preview" aria-label={ru ? 'Превью диктовки' : 'Dictation preview'}>
    <div className="dictation-preview__header settings-preview">
      <StatefulWarpSurface running={c.enabled} active={active && !pinned} reducedMotion={reducedMotion} />
      <div className="settings-preview__header"><Switch label={ru ? 'Диктовка' : 'Dictation'} checked={c.enabled} disabled={Boolean(c.busy)} onChange={enabled => { void (enabled ? onEnable() : onDisable?.())?.catch(() => {}) }} /></div>
      <span ref={anchor} className="dictation-preview__anchor" aria-hidden="true" />
    </div>
    <div className="dictation-preview__dock" data-pinned={pinned || undefined}>
      <PreviewCycle config={config} glassMaterial={glassMaterial} appearance={appearance} locale={locale} active={active && visible} still={still} shortcutActivation={c.data?.settings.shortcut_activation ?? 'toggle'} />
    </div>
  </section>
}

function PreviewCycle({ appearance, config, glassMaterial, locale, active, still, shortcutActivation }: { appearance: DictationAppearance; config?: AppConfig; glassMaterial: GlassMaterial; locale: 'ru' | 'en'; active: boolean; still: boolean; shortcutActivation: ShortcutActivation }) {
  const appearanceKey = `${appearance.theme}:${appearance.palette}:${appearance.chromatic}`
  const [cycle, setCycle] = useState({ appearanceKey, step: 0 })
  // Replay a new choice without destroying the canvas, shaders or artwork clock.
  if (cycle.appearanceKey !== appearanceKey) setCycle({ appearanceKey, step: 0 })
  const step = cycle.appearanceKey === appearanceKey ? cycle.step : 0
  const phase = step % 3
  useEffect(() => {
    if (!active || still) return
    const timer = window.setTimeout(() => setCycle(value => ({ ...value, step: (value.step + 1) % 12 })), [4200, 1600, 1800][phase])
    return () => window.clearTimeout(timer)
  }, [active, still, phase, appearanceKey])
  const state = (['recording', 'transcribing', 'completed'] as const)[still ? 0 : phase]
  return <div className="dictation-preview__scene" data-phase={state} data-static={still || !active} inert aria-hidden="true">
    <DictationOverlayView visible advancedGlass={getUiPrefs(config).advancedGlass} locale={locale} appearance={appearance} glassMaterial={glassMaterial}
      interfaceTheme={getInterfaceTheme(config)} interfacePalette={getInterfacePalette(config)} paletteStyle={getInterfacePaletteStyle(config)}
      active={active} demo reducedMotion={still} status={{ revision: 0, operationId: Math.floor(step / 3), phase: state, ready: true, text: '', error: null, shortcutActivation }} levels={[.2,.5,.8,.6,.9,.45,.3,.55]} text={{ committed: '', tentative: '' }} cancel={async () => {}} copy={async () => {}} />
  </div>
}
