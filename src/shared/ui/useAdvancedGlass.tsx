import { useId, useMemo } from 'react'
import { GLASS_SURFACE_IDS, getSurfaceDefaults, normalizeAdvancedGlass, type AdvancedGlassOverrides, type GlassSurfaceId, type GlassSurfaceSettings } from '../lib/advancedGlass'
import type { GlassMaterial } from '../lib/glassMaterialTokens'
import field from './glisse-bezel.png?inline'

// Each selector targets an existing surface. Its layout and event ownership
// stay with the production component, including in the layout editor.
const surfaces: Record<GlassSurfaceId, string[]> = {
  body: ['.island-card'],
  transport: ['.play-button', '.media-button:not(.seek-step-button, .system-volume__button)'],
  seek: ['.seek-step-button'],
  reactions: ['.reaction-button:not(.playback-mode-button)'],
  modes: ['.playback-mode-button'],
  volume: ['.system-volume__button', '.system-volume__panel'],
  actions: ['.island-actions .icon-button', '.island-plugin-button', '.island-local-servers button', '.island-latest-dictation button', '.island-update-rail button', '.wave-selection-chip button', '.direct-reload-button'],
  usage: ['.usage-chip__compact-provider', '.usage-chip__provider'],
  localServers: ['.island-local-servers', '.island-preview__widget'],
  latestDictation: ['.island-latest-dictation'],
  notices: ['.island-update-rail', '.hover-coach__label', '.wave-selection-chip', '.direct-reload-banner'],
  progressTrack: ['.progress-track'],
  progressFill: ['.progress-fill', '.collapsed-progress__fill'],
  dictation: ['&[data-native-backdrop-surface]', '.dictation-cloud__core[data-native-backdrop-surface]'],
  dictationActions: ['button:not(.dictation-cloud__interaction)'],
}

const readingSurface = new Set<GlassSurfaceId>(['usage','localServers','latestDictation','notices'])
const isRecorder = (id: GlassSurfaceId) => id === 'dictation' || id === 'dictationActions'
type Fields = Partial<GlassSurfaceSettings>

function paint(group: GlassSurfaceId, values: GlassSurfaceSettings, changed: Fields) {
  const declarations: string[] = []
  if (changed.text) {
    for (const token of ['color', '--fg-primary', '--fg-secondary', '--fg-muted', '--island-glass-ink', '--glass-reading-secondary', '--dictation-reading-ink']) {
      declarations.push(token + ':' + values.text)
    }
  }
  if (changed.background || changed.transparency !== undefined) {
    const t = values.transparency / 100
    const transmission = Math.min(t, .55) * .91 + Math.max(t - .55, 0) * .55
    const reading = transmission * (1 - .62 * transmission)
    const top = 1 - Math.max(.14, 1 - .40 / Math.max(.01, transmission))
    const detached = group === 'actions' || group === 'dictationActions'
    const defaultAlpha = group === 'body' || group === 'dictation' || readingSurface.has(group) ? 1 - transmission : 1 - (detached ? reading : top)
    const alpha = changed.transparency !== undefined ? 1 - t : defaultAlpha
    const fill = `color-mix(in srgb, ${values.background} ${(alpha * 100).toFixed(3)}%, transparent)`
    if (group !== 'progressFill') declarations.push(`background-color:${fill}`, `--island-lens-fill:${fill}`)
    if (readingSurface.has(group)) declarations.push('background-image:none')
    if (group === 'dictation' || group === 'dictationActions') {
      declarations.push('background-color:transparent', `--island-optic-fill:${fill}`, `--advanced-recorder-fill:${fill}`)
    }
  }
  if (changed.parallax !== undefined) declarations.push('--glass-parallax-strength:' + values.parallax / 100)
  if (changed.highlight !== undefined) {
    declarations.push('--glass-highlight:' + values.highlight / 100, '--glass-highlight-strength:' + values.highlight / 100)
  }
  if (changed.edge !== undefined) declarations.push('--glass-edge-width:' + (.5 + 1.5 * values.edge / 100) + 'px')
  if (changed.rim !== undefined || changed.edge !== undefined || changed.highlight !== undefined) {
    const width = .5 + 1.5 * values.edge / 100
    const strength = changed.rim === undefined ? .13 : values.rim
    const shine = values.highlight / 100
    const line = `inset 0 0 0 ${width}px rgb(255 255 255 / ${strength}), inset 0 ${width}px rgb(255 255 255 / ${strength * shine})`
    declarations.push(`--glass-control-rim:${line}`, `--island-lens-rim:${line}`, 'box-shadow:var(--glass-control-rim)')
  }
  if (group === 'progressTrack') {
    if (changed.height !== undefined) declarations.push('height:' + values.height + 'px')
    if (changed.textSize !== undefined) declarations.push('--advanced-track-type:' + values.textSize + 'px')
  }
  if (group === 'progressFill' || group === 'progressTrack') {
    if (changed.radius !== undefined) declarations.push('border-radius:' + values.radius + 'px')
  }
  if (group === 'progressFill' && (changed.background || changed.endColor || changed.angle !== undefined || changed.transparency !== undefined)) {
    const start = changed.background ?? 'var(--island-progress-start)'
    const end = changed.endColor ?? (changed.background ? `color-mix(in srgb,${start} 96%,black)` : 'var(--island-progress-end)')
    const mix = (color: string) => `color-mix(in srgb,${color} ${100 - values.transparency}%,transparent)`
    declarations.push(`background:linear-gradient(${values.angle}deg,${mix(start)},${mix(end)})`)
  }
  return declarations
}

/** Separate red/green/blue ray lengths on Glisse's precomputed normal field.
 * No canvas encoding or geometry-dependent map generation while scrubbing. */
function renderRefraction({ id, bend, dispersion }: { id: string; bend: number; dispersion: number }) {
  const scale = bend * (15 / .45)
  return <filter key={id} id={id} x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
    <feImage href={field} width="100%" height="100%" preserveAspectRatio="none" result="normals" />
    {dispersion === 0 ? <feDisplacementMap in="SourceGraphic" in2="normals" scale={scale} xChannelSelector="R" yChannelSelector="G" /> : <>
      {['r','g','b'].map((channel, index) => <feDisplacementMap key={channel} in="SourceGraphic" in2="normals"
        scale={scale + (index - 1) * dispersion * 12} xChannelSelector="R" yChannelSelector="G" result={channel} />)}
      <feColorMatrix in="r" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .33333 0" result="red" />
      <feColorMatrix in="g" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 .33333 0" result="green" />
      <feColorMatrix in="b" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 .33334 0" result="blue" />
      <feComposite in="red" in2="green" operator="arithmetic" k2="1" k3="1" result="rg" />
      <feComposite in="rg" in2="blue" operator="arithmetic" k2="1" k3="1" />
      <feColorMatrix values="3 0 0 0 0  0 3 0 0 0  0 0 3 0 0  0 0 0 1 0" />
    </>}
  </filter>
}

// The editor, onboarding and native recorder can coexist in one document.
// Scope the stylesheet and SVG fragment IDs to their owning instance.
export function useAdvancedGlass(raw: AdvancedGlassOverrides | undefined, base: GlassMaterial, recorder = false) {
  const scopeId = useId().replace(/[^a-zA-Z0-9_-]/g, '_')
  const { transparency, frost, parallax, highlight, edge } = base
  return useMemo(() => {
    const settings = normalizeAdvancedGlass(raw)
    const groups = GLASS_SURFACE_IDS.filter(id => settings[id] && isRecorder(id) === recorder)
    if (!groups.length) return { attributes: {}, layers: null, regionFrostKey: '' }
    const root = `[data-advanced-glass-key][data-glass-scope="${scopeId}"]:not([data-reduced-transparency="true"],[data-native-backdrop="unavailable"])`
    const filters = new Map<string, { id: string; bend: number; dispersion: number }>()
    const rules: string[] = []
    const material = { transparency, frost, parallax, highlight, edge }
    for (const group of groups) {
      const changed = settings[group]!
      const values = { ...getSurfaceDefaults(group, material), ...changed }
      const selector = ':is(' + surfaces[group].map(s => s.startsWith('&') ? root + s.slice(1) : root + ' ' + s).join(',') + ')'
      const declarations = paint(group, values, changed)
      const customOptic = changed.bend !== undefined || changed.dispersion !== undefined
      if (customOptic || changed.frost !== undefined) {
        const parts: string[] = []
        let refraction = ''
        if (values.frost > 0) parts.push(`blur(${values.frost}px)`)
        if (customOptic && (values.bend || values.dispersion)) {
          const key = values.bend + '/' + values.dispersion
          if (!filters.has(key)) filters.set(key, { id: 'glass-optics-' + scopeId + '-' + filters.size, bend: values.bend, dispersion: values.dispersion })
          refraction = 'url("#' + filters.get(key)!.id + '")'
          parts.push(refraction)
        }
        if (changed.frost !== undefined) {
          declarations.push('--glass-user-blur:' + values.frost + 'px', '--glass-region-frost:' + values.frost / 32)
          if (group === 'body') declarations.push('--glass-region-blur:' + values.frost * .75)
        }
        const filter = parts.length ? parts.join(' ') : 'none'
        // DWM owns external silhouettes. Only inner controls sample the rendered
        // player. Optical props on independent regions are consumed natively.
        const lens = group === 'body' || isRecorder(group)
        const browser = selector.replaceAll(root, root + ':not([data-native-backdrop])')
        if (lens) {
          // Setting just frost updates --lg-blur through --glass-user-blur
          // while retaining the stock player's field until bend is edited.
          if (customOptic) rules.push(browser + ' > .island-glass-optic[data-active] > .lg-glass{backdrop-filter:' + filter + '}')
          if (group === 'dictationActions') rules.push(browser + ':not(:has(> .island-glass-optic)){backdrop-filter:' + filter + '}')
        } else if (readingSurface.has(group) || group === 'actions') {
          rules.push(browser + '{backdrop-filter:' + filter + '}')
          if (group === 'actions') rules.push(selector + ':is(.island-surface button){backdrop-filter:' + filter + '}')
        } else if (group === 'progressFill') {
          // The fill can be completely opaque. Frost its artwork directly,
          // keeping the overlaid time and title sharp at every transmission.
          if (changed.frost !== undefined) declarations.push('filter:blur(' + values.frost + 'px)')
          declarations.push('backdrop-filter:' + (refraction || 'none'))
        } else {
          declarations.push('backdrop-filter:' + filter)
        }
        if (refraction) {
          // HostBackdropBrush never exposes other apps’ pixels to WebView2.
          // Refract our own broad material reflection there. Both the artwork
          // and text stay outside this layer. No desktop capture or render loop.
          const native = selector.replaceAll(root, root + '[data-native-backdrop]')
          const reflection = '{content:"";position:absolute;pointer-events:none;inset:0;border-radius:inherit;'
            + 'background:linear-gradient(165deg,transparent 46%,rgb(210 223 239 / .13) 75%,rgb(242 245 249 / .25) 82%,transparent 95%);'
            + 'opacity:1;filter:' + refraction + ';}'
          if (isRecorder(group)) {
            rules.push(native + ' > .island-glass-optic > .lg-glass::after' + reflection)
            if (group === 'dictationActions') rules.push(native + ':not(:has(> .island-glass-optic))::after' + reflection)
          } else if (readingSurface.has(group) || group === 'actions') {
            rules.push(native + '::after' + reflection)
          } else if (group === 'progressFill') {
            // Even a fully opaque fill has a surface of its own to refract.
            rules.push(selector + '::after' + reflection)
          }
        }
      }
      if (declarations.length) rules.push(selector + '{' + declarations.join(';') + '}')
      if (group === 'progressTrack' && changed.textSize !== undefined) rules.push(selector + ' .progress-content{font-size:var(--advanced-track-type)}')
      if (group === 'dictationActions' && (changed.background || changed.transparency !== undefined)) {
        rules.push(selector + ':not(:has(> .island-glass-optic)){background-color:var(--advanced-recorder-fill)}')
      }
      if (changed.rim !== undefined || changed.highlight !== undefined || changed.edge !== undefined) {
        const clickable = selector + ':is(button,a[href],[role=button],[role=slider])'
        rules.push(clickable + '::before{opacity:' + (values.rim === 0 ? 0 : values.highlight / 100) + '}')
        if (group === 'dictationActions') rules.push(clickable + ' > .island-glass-optic > .lg-glass{box-shadow:none}')
      }
    }
    const key = JSON.stringify(groups.map(id => [id, settings[id]]))
    const regionFrostKey = groups
      .filter(id => settings[id]?.frost !== undefined && (['body','actions'].includes(id) || readingSurface.has(id) || isRecorder(id)))
      .map(id => id + ':' + settings[id]!.frost).join(',')
    return {
      attributes: { 'data-advanced-glass-key': key, 'data-glass-scope': scopeId },
      regionFrostKey,
      layers: <>
        <style>{'@media not ((forced-colors:active) or (prefers-contrast:more) or (prefers-reduced-transparency:reduce)){' + rules.join('\n') + '}'}</style>
        {filters.size > 0 && <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute', pointerEvents: 'none' }}>
          <defs>{[...filters.values()].map(renderRefraction)}</defs>
        </svg>}
      </>,
    }
  }, [scopeId, raw, recorder, transparency, frost, parallax, highlight, edge])
}
