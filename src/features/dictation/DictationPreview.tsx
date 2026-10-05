import type { DictationController } from '../../app/useIslandApp'
import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Switch } from '../../shared/ui/SettingsControls'
import { StatefulWarpSurface } from '../../shared/ui/StatefulWarpSurface'
import { DictationOverlayView } from './DictationOverlay'

export function DictationPreview({ controller: c, locale, active, reducedMotion, onEnable, onDisable }: {
  controller: DictationController; locale: 'ru' | 'en'; active: boolean; reducedMotion: boolean
  onEnable: () => Promise<void>; onDisable?: () => Promise<void>
}) {
  const ru = locale === 'ru'
  const systemReducedMotion = useReducedMotion()
  const still = reducedMotion || Boolean(systemReducedMotion)
  const [phase, setPhase] = useState(0)
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  useEffect(() => {
    if (!active || !visible || still) return
    const timer = window.setTimeout(() => setPhase(value => (value + 1) % 3), [4200, 1600, 1800][phase])
    return () => window.clearTimeout(timer)
  }, [active, visible, still, phase])
  const state = (['recording', 'transcribing', 'completed'] as const)[still ? 0 : phase]
  return <section className="dictation-preview settings-preview" aria-label={ru ? 'Превью диктовки' : 'Dictation preview'}>
    <StatefulWarpSurface running={c.enabled} active={active} reducedMotion={reducedMotion} />
    <div className="settings-preview__header"><Switch label={ru ? 'Диктовка' : 'Dictation'} checked={c.enabled} disabled={Boolean(c.busy)} onChange={enabled => { void (enabled ? onEnable() : onDisable?.())?.catch(() => {}) }} /></div>
    <div className="dictation-preview__scene" data-phase={state} data-static={still || !active || !visible} inert aria-hidden="true">
      <DictationOverlayView visible locale={locale} reducedMotion={still} status={{ revision: 0, operationId: phase, phase: state, ready: true, text: '', error: null }} levels={[.2,.5,.8,.6,.9,.45,.3,.55]} text={{ committed: '', tentative: '' }} cancel={async () => {}} copy={async () => {}} />
    </div>
  </section>
}
