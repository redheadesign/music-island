import { normalizeHexColor } from './accentTheme'
import { GLASS_SURFACE_FIELDS, GLASS_SURFACE_IDS, getSurfaceDefaults, normalizeAdvancedGlass, normalizeDesktopGlassMode, normalizeDesktopLens } from './advancedGlass'
import { dictationGlassMaterial, getDictationAppearance } from './dictationAppearance'
import { getGlassMaterial } from './glassMaterial'
import { getIslandLayout } from './islandLayout'
import { normalizeDictationShader, normalizeIslandShader, shaderOverrides } from './shaderTuning'
import { getTaskbarLayout } from './taskbarLayout'
import type { AppConfig } from './types'
import { getInterfacePalette, getInterfacePaletteStyle, getInterfaceTheme, getLocalServersWidgetScale, getUiPrefs, getUsageWidgetCompact, getUsageWidgetScale } from './uiPrefs'

/** A shareable visual snapshot. Build it from named visual settings only. */
export function serializeAppearancePreset(config: AppConfig): string {
  const ui = getUiPrefs(config)
  const glass = getGlassMaterial(config)
  const capsule = getDictationAppearance(config)
  const capsuleGlass = dictationGlassMaterial(capsule, glass)
  const advanced = normalizeAdvancedGlass(ui.advancedGlass)
  const effective = Object.fromEntries(GLASS_SURFACE_IDS.map(id => {
    const base = getSurfaceDefaults(id, id === 'dictation' || id === 'dictationActions' ? capsuleGlass : glass)
    return [id, Object.fromEntries(GLASS_SURFACE_FIELDS[id].map(field => {
      // Artwork, track placement and compact mode resolve these at paint time.
      const automatic = ['background', 'text', 'height', 'textSize', 'radius'].includes(field)
      const inherited = automatic ? 'auto' : base[field]
      return [field, advanced[id]?.[field] ?? inherited]
    }))]
  }))
  const { theme, opacity, blurStrength, cornerRadius, reducedMotion } = config.appearance
  const { size, width, scale, density, preset, showArtwork, showTitle, showArtist, showProgress, showSource, showPreviousNext } = config.layout
  const islandLayout = getIslandLayout(config)
  const islandShader = normalizeIslandShader(ui.islandShader)
  const palette = getInterfacePaletteStyle(config)
  const themeId = getInterfaceTheme(config)
  return JSON.stringify({
    format: 'music-island.appearance', version: 1,
    island: {
      theme: themeId, palette: getInterfacePalette(config),
      colors: { customAccent: normalizeHexColor(config.appearance.accentColor), primary: palette['--accent'], secondary: palette['--accent-soft'] },
      appearance: { theme, opacity, blurStrength, cornerRadius, reducedMotion },
      layout: { size, width, scale, density, preset, showArtwork, showTitle, showArtist, showProgress, showSource, showPreviousNext, ...islandLayout },
      widgets: { usageScale: getUsageWidgetScale(config), usageCompact: getUsageWidgetCompact(config),
        localServersScale: getLocalServersWidgetScale(config), showLatestDictation: ui.showLatestDictationMessage === true },
      glass, glassOverrides: Object.fromEntries(Object.entries(glass).filter(([key]) =>
        Number.isFinite(ui.glassMaterial?.[key as keyof typeof glass]))),
      desktopGlass: { mode: normalizeDesktopGlassMode(ui.desktopGlassMode), ...normalizeDesktopLens(ui.desktopLens) },
      shaders: { playbackWaveEnabled: ui.playbackWaveEnabled !== false, overrides: shaderOverrides(ui.islandShader, islandShader), effective: islandShader },
    },
    dictation: {
      artwork: capsule.theme, palette: capsule.palette, chromatic: capsule.chromatic,
      material: capsule.materialTheme ?? 'follow-island', effectiveMaterial: capsule.materialTheme ?? themeId,
      glassOverride: capsule.glassMaterial ?? null, effectiveGlass: capsuleGlass,
      shaders: { overrides: capsule.shaderTuning ?? {}, effective: normalizeDictationShader(capsule.shaderTuning) },
    },
    surfaces: { overrides: advanced, effective },
    taskbar: { enabled: config.taskbar.enabled, scale: config.taskbar.scale ?? 1, layout: getTaskbarLayout(config) },
  }, null, 2)
}
