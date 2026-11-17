import type { ReactNode } from 'react'
import type { InterfaceScene, InterfaceThemeId } from '../../shared/lib/interfaceTheme'
import type { SettingsColorScheme } from '../../shared/lib/uiPrefs'
import { Minus, X } from '../../shared/ui/SettingsIcons'
import { IconButton } from '../../shared/ui/IconButton'
import './settings.css'

/** The native window and Storybook use exactly the same viewport/scroll tree. */
export function SettingsWindow({ children, locale = 'ru', colorScheme = 'dark', interfaceTheme = 'classic', interfaceScene, reducedTransparency, reducedMotion, onMinimize, onClose }: {
  children: ReactNode
  locale?: 'ru' | 'en'
  colorScheme?: SettingsColorScheme
  interfaceTheme?: InterfaceThemeId
  interfaceScene?: InterfaceScene
  reducedTransparency?: boolean
  reducedMotion?: boolean
  onMinimize?: () => void
  onClose?: () => void
}) {
  return <main
    className="settings-window-root"
    data-color-scheme={colorScheme}
    data-interface-theme={interfaceTheme}
    data-interface-scene={interfaceScene}
    data-reduced-transparency={reducedTransparency || undefined}
    data-reduced-motion={reducedMotion || undefined}
  >
    <header className="settings-titlebar" data-tauri-drag-region>
      <strong className="settings-titlebar-drag">{locale === 'ru' ? 'Настройки' : 'Settings'}</strong>
      <div className="settings-window-actions" data-tauri-drag-region="false">
        <IconButton aria-label={locale === 'ru' ? 'Свернуть' : 'Minimize'} onClick={onMinimize}><Minus /></IconButton>
        <IconButton aria-label={locale === 'ru' ? 'Закрыть' : 'Close'} onClick={onClose}><X /></IconButton>
      </div>
    </header>
    <div className="settings-scroll">{children}</div>
  </main>
}
