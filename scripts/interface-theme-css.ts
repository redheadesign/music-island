import postcss, { type Plugin } from 'postcss'
import { DEFAULT_GLASS_MATERIAL, glassMaterialStyle } from '../src/shared/lib/glassMaterialTokens.ts'
import { INTERFACE_THEMES, type ThemeDefinition, type ThemeRoles } from '../src/shared/lib/interfaceTheme.ts'

/** Material selectors keep their original specificity. Adding a theme only changes the registry. */
export function interfaceThemeCss(themes: Record<string, ThemeDefinition> = INTERFACE_THEMES): Plugin {
  const entries = Object.entries(themes)
  const selector = (id: string) => `[data-interface-theme='${id}']`
  const materials = new Map<string, string>()
  for (const material of ['classic', 'glass'] as const) {
    const selectors = entries.filter(([, theme]) => theme.material === material).map(([id]) => selector(id))
    if (selectors.length > 1) materials.set(material, `:is(${selectors.join(',')})`)
  }
  return {
    postcssPlugin: 'music-island-interface-themes',
    Once(root) {
      if (materials.size) root.walkRules(rule => {
        rule.selector = rule.selector.replace(/\[data-interface-theme=(['"])(classic|glass)\1\]/g,
          (original: string, _quote: string, material: string) => materials.get(material) ?? original)
      })
      root.walkAtRules('interface-theme-roles', marker => {
        // The first paint and standalone components use the same preset as Settings.
        // Declare it once at the root so nested surfaces inherit live overrides.
        const defaults = postcss.rule({ selector: ':root', source: marker.source })
        for (const [prop, value] of Object.entries(glassMaterialStyle(DEFAULT_GLASS_MATERIAL))) {
          defaults.append(postcss.decl({ prop, value: String(value), source: marker.source }))
        }
        marker.before(defaults)
        for (const [id, theme] of entries) {
          const base = themes[theme.material]
          const write = (scope: string, roles: ThemeRoles) => {
            if (!Object.keys(roles).length) return
            const rule = postcss.rule({ selector: scope, source: marker.source })
            for (const [prop, value] of Object.entries(roles)) {
              if (value !== undefined) rule.append(postcss.decl({ prop, value, source: marker.source }))
            }
            marker.before(rule)
          }
          const scope = selector(id) + '[data-interface-theme]'
          write(scope, { ...base.roles, ...theme.roles })
        }
        marker.remove()
      })
    },
  }
}
