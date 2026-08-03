import { Mic2, Puzzle } from 'lucide-react'
import type { PluginRuntimeInfo } from '../../shared/lib/types'

interface PluginRailProps {
  plugins: PluginRuntimeInfo[]
  onOpenPluginSettings: (pluginId: string) => void
  onTogglePlugin: (pluginId: string) => void
}

export function PluginRail({ plugins, onOpenPluginSettings, onTogglePlugin }: PluginRailProps) {
  if (plugins.length === 0) return null

  return (
    <header className="island-plugins" aria-label="Plugins">
      {plugins.map((plugin) => {
        const primary = plugin.railActions[0] ?? 'open-settings'
        return (
          <button
            key={plugin.id}
            type="button"
            className={`icon-button island-plugin-button island-plugin-button--${plugin.state}`}
            aria-label={plugin.name}
            title={`${plugin.name}: ${plugin.message}`}
            onClick={() => {
              if (primary === 'toggle') onTogglePlugin(plugin.id)
              else onOpenPluginSettings(plugin.id)
            }}
          >
            {pluginIcon(plugin)}
          </button>
        )
      })}
    </header>
  )
}

function pluginIcon(plugin: PluginRuntimeInfo) {
  if (plugin.icon === 'mic' || plugin.id === 'better-voice') {
    return <Mic2 size={16} />
  }
  return <Puzzle size={16} />
}
