import type { AppConfig } from '../../shared/lib/types'
import type { ReactNode } from 'react'

interface SettingsPanelProps {
  config: AppConfig
  updateMessage: string | null
  onChange: (config: AppConfig) => void
  onResetPosition: () => void
  onCheckUpdates: () => void
  onCopyDiagnostics: () => void
}

export function SettingsPanel({
  config,
  updateMessage,
  onChange,
  onResetPosition,
  onCheckUpdates,
  onCopyDiagnostics,
}: SettingsPanelProps) {
  const patchLayout = (layout: Partial<AppConfig['layout']>) => {
    onChange({ ...config, layout: { ...config.layout, ...layout } })
  }

  const patchAppearance = (appearance: Partial<AppConfig['appearance']>) => {
    onChange({ ...config, appearance: { ...config.appearance, ...appearance } })
  }

  const patchBehavior = (behavior: Partial<AppConfig['behavior']>) => {
    onChange({ ...config, behavior: { ...config.behavior, ...behavior } })
  }

  return (
    <section className="settings-panel" aria-label="Island settings">
      <SettingsSection title="Layout">
        <label className="settings-control-row">
          <strong>Size</strong>
          <div className="segmented-control" aria-label="Island size">
            {(['small', 'medium', 'large'] as const).map((size) => (
              <button
                type="button"
                key={size}
                className={config.layout.size === size ? 'is-active' : ''}
                onClick={() => patchLayout({ size })}
              >
                {size[0].toUpperCase() + size.slice(1)}
              </button>
            ))}
          </div>
        </label>

        <label className="settings-control-row">
          <strong>Scale</strong>
          <div className="range-control">
            <input
              type="range"
              min="80"
              max="140"
              value={config.layout.scale}
              onChange={(event) => patchLayout({ scale: Number(event.currentTarget.value) })}
            />
            <output>{config.layout.scale}%</output>
          </div>
        </label>
      </SettingsSection>

      <SettingsSection title="Content">
        <div className="toggle-list">
          <Toggle label="Artwork" checked={config.layout.showArtwork} onChange={(showArtwork) => patchLayout({ showArtwork })} />
          <Toggle label="Title" checked={config.layout.showTitle} onChange={(showTitle) => patchLayout({ showTitle })} />
          <Toggle label="Artist" checked={config.layout.showArtist} onChange={(showArtist) => patchLayout({ showArtist })} />
          <Toggle label="Progress" checked={config.layout.showProgress} onChange={(showProgress) => patchLayout({ showProgress })} />
          <Toggle label="Source" checked={config.layout.showSource} onChange={(showSource) => patchLayout({ showSource })} />
          <Toggle label="Previous / Next" checked={config.layout.showPreviousNext} onChange={(showPreviousNext) => patchLayout({ showPreviousNext })} />
        </div>
      </SettingsSection>

      <SettingsSection title="Behavior">
        <div className="toggle-list">
          <Toggle label="Reduced motion" checked={config.appearance.reducedMotion} onChange={(reducedMotion) => patchAppearance({ reducedMotion })} />
          <Toggle label="Pin expanded" checked={config.behavior.pinExpanded} onChange={(pinExpanded) => patchBehavior({ pinExpanded })} />
          <Toggle label="Hide over fullscreen" checked={config.behavior.hideOverFullscreen} onChange={(hideOverFullscreen) => patchBehavior({ hideOverFullscreen })} />
          <Toggle label="Launch at startup" checked={config.behavior.launchAtStartup} onChange={(launchAtStartup) => patchBehavior({ launchAtStartup })} />
        </div>
      </SettingsSection>

      <SettingsSection title="Maintenance">
        <div className="settings-actions">
          <button type="button" onClick={onResetPosition}>
            Reset Position
          </button>
          <button type="button" onClick={onCheckUpdates}>
            Check Updates
          </button>
          <button type="button" onClick={onCopyDiagnostics}>
            Copy Diagnostics
          </button>
        </div>
      </SettingsSection>

      {updateMessage ? <p className="settings-note">{updateMessage}</p> : null}
    </section>
  )
}

interface SettingsSectionProps {
  title: string
  children: ReactNode
}

function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  )
}

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className="toggle">
      <strong>{label}</strong>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
    </label>
  )
}
