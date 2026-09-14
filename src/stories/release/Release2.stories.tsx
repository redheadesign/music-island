import { useRef, useState } from 'react'
import { exportReleaseScene } from './exportReleaseScene'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { getDefaultConfig } from '../../app/tauriApi'
import { IslandLayoutEditor } from '../../features/settings/IslandLayoutEditor'
import { TaskbarLayoutEditor } from '../../features/settings/TaskbarLayoutEditor'
import { SettingsPanel } from '../../features/settings/SettingsPanel'
import { VoiceControlCard } from '../../features/plugins/voice/VoiceControlCard'
import { VoiceSignalFlow } from '../../features/plugins/voice/VoiceSignalFlow'
import { UsageStatusChip } from '../../features/usage/UsageStatusChip'
import { WarpMaterial } from '../../shared/ui/WarpMaterial'
import { BrandLogo } from '../../shared/ui/BrandLogo'
import { withUiPrefs } from '../../shared/lib/uiPrefs'
import type { UsageSnapshot } from '../../shared/lib/usageTypes'
import { audioStats, health } from '../fixtures'
import './release.css'

const noop = () => undefined
// Fictional, fixed sample data. Marketing captures never read a local account.
const usage: UsageSnapshot = {
  codex: { provider: 'codex', source: 'codex-app-server', state: 'connected', plan: null, fetchedAt: 1_789_380_000, staleSince: null, messageCode: null,
    windows: [{ id: 'primary', label: '5 h', usedPercent: 28, remainingPercent: 72, windowDurationMinutes: 300, resetsAt: null }, { id: 'secondary', label: '7 d', usedPercent: 39, remainingPercent: 61, windowDurationMinutes: 10080, resetsAt: null }] },
  claude: { provider: 'claude', source: 'claude-oauth', state: 'connected', plan: null, fetchedAt: 1_789_380_000, staleSince: null, messageCode: null,
    windows: [{ id: 'primary', label: '5 h', usedPercent: 46, remainingPercent: 54, windowDurationMinutes: 300, resetsAt: null }, { id: 'secondary', label: '7 d', usedPercent: 63, remainingPercent: 37, windowDurationMinutes: 10080, resetsAt: null }] },
}
const copy = {
  ru: {
    island: { title: <>Ваш островок.<br />Ваши правила.</>, detail: 'Перетаскивайте элементы. Меняйте размер прямо в превью.' },
    taskbar: { title: <>Музыка.<br />Всегда под рукой.</>, detail: 'Мини-плеер в панели задач. Только нужные вам кнопки.' },
    voice: { title: <>Ваш голос.<br />Без лишнего шума.</>, detail: 'От микрофона до чистого звука — один понятный маршрут.' },
    usage: { title: <>Лимиты ИИ.<br />Одним взглядом.</>, detail: 'Codex и Claude рядом с островком.' },
    settings: { title: <>Всё на месте.<br />В вашей теме.</>, detail: 'Светлые и тёмные настройки с живым превью.' },
  },
  en: {
    island: { title: 'Your island. Your layout.', detail: 'Drag your controls into place. Resize directly in the preview.' },
    taskbar: { title: 'Music, within reach.', detail: 'A taskbar mini-player with just the controls you need.' },
    voice: { title: 'Your voice. Less noise.', detail: 'One clear path from your microphone to cleaner sound.' },
    usage: { title: 'AI limits at a glance.', detail: 'Codex and Claude, right beside your island.' },
    settings: { title: 'Settings, in your theme.', detail: 'Light and dark. A live preview that makes it yours.' },
  },
}
type Feature = keyof typeof copy.en

function ReleaseScene({ feature, format }: { feature: Feature; format: 'telegram' | 'readme' }) {
  const scene = useRef<HTMLElement>(null)
  const [exportUrl, setExportUrl] = useState('')
  const [exportStatus, setExportStatus] = useState('Export PNG')
  const exportImage = async () => {
    if (!scene.current) return
    setExportStatus('Rendering…')
    try {
      await document.fonts.ready
      setExportUrl(await exportReleaseScene(scene.current))
      setExportStatus('Export PNG')
    } catch { setExportStatus('Export failed — retry') }
  }
  const [storedConfig, setConfig] = useState(() => {
    const base = structuredClone(getDefaultConfig())
    base.appearance.reducedMotion = true
    base.appearance.locale = 'ru'
    base.appearance.accentColor = '#f76100'
    base.plugins.settings.ui = { hoverCoachCompleted: true, usageWidgetCompact: true }
    // Use the app's default provider placement: Codex belongs on the left.
    base.plugins.settings.usage = { codexEnabled: true, claudeEnabled: false }
    return base
  })
  const locale = format === 'readme' ? 'en' : 'ru'
  const config = { ...storedConfig, appearance: { ...storedConfig.appearance, locale } } as typeof storedConfig
  const text = copy[locale][feature]
  return <><article ref={scene} className={`release-scene release-scene--${format} release-scene--${feature}`}>
    <header className="release-heading"><h1>{text.title}</h1><p className="release-description">{text.detail}</p></header>
    <main className="release-visual">
      {feature === 'island' && <div className="release-ui release-ui--editor settings-window-root"><IslandLayoutEditor config={config} usage={usage} onChange={setConfig} showHeading={false} /></div>}
      {feature === 'taskbar' && <div className="release-ui release-ui--taskbar settings-window-root"><TaskbarLayoutEditor config={config} onChange={setConfig} /></div>}
      {feature === 'voice' && <div className="release-ui release-ui--voice settings-window-root">
        <VoiceControlCard locale={locale} running monitorEnabled={false} activeEffect={null} reducedMotion previewClipId="fox-live" onToggleProcessing={noop} onToggleMonitor={noop} onToggleEffect={noop} />
        <VoiceSignalFlow input={{ label: locale === 'en' ? 'Microphone' : 'Микрофон', value: locale === 'en' ? 'Studio microphone' : 'Студийный микрофон', options: [locale === 'en' ? 'Studio microphone' : 'Студийный микрофон'], onChange: noop }} output={{ label: locale === 'en' ? 'Output' : 'Выход', value: 'CABLE Input', options: ['CABLE Input'], onChange: noop }} processingLabel={locale === 'en' ? 'Processing' : 'Обработка'} runningLabel={locale === 'en' ? 'On' : 'Включена'} stoppedLabel={locale === 'en' ? 'Off' : 'Выключена'} running meterActive reducedMotion stats={audioStats} />
      </div>}
      {feature === 'usage' && <div className="release-quota-stage">
        <WarpMaterial reducedMotion className="preview-warp-material" />
        <div className="release-quota-compact"><UsageStatusChip snapshot={usage} enabledProviders={['codex','claude']} compact locale={locale} /></div>
        <div className="release-quota-details"><UsageStatusChip snapshot={usage} enabledProviders={['codex','claude']} compact={false} locale={locale} /></div>
      </div>}
      {feature === 'settings' && <div className="release-settings-pair">
        <div className="release-settings-window settings-window-root"><SettingsPanel config={withUiPrefs(config,{settingsColorScheme:'dark'})} smtcHealth={health} mediaSessions={[]} onChange={noop} onCopyDiagnostics={noop} onRefreshSources={noop} /></div>
        <div className="release-settings-window release-settings-window--light settings-window-root"><SettingsPanel config={withUiPrefs(config,{settingsColorScheme:'light'})} smtcHealth={health} mediaSessions={[]} onChange={noop} onCopyDiagnostics={noop} onRefreshSources={noop} /></div>
        <div className="release-source-logos"><BrandLogo brand="yandex-music" size={32}/><BrandLogo brand="spotify" size={32}/><BrandLogo brand="windows" size={30}/></div>
      </div>}
    </main>
  </article><nav className="release-export" aria-label="Image export"><button type="button" onClick={exportImage}>{exportStatus}</button>{exportUrl && <a data-release-download href={exportUrl} download={`${feature}-${format}.png`}>Download PNG</a>}</nav></>
}
const meta = {
  title: 'Screens/Release2', component: ReleaseScene,
  parameters: { layout: 'fullscreen', workshop: { bare: true } },
  args: { feature: 'island', format: 'telegram' },
} satisfies Meta<typeof ReleaseScene>
export default meta
type Story = StoryObj<typeof meta>
export const Island: Story = { name: '01 · Свой островок' }
export const Taskbar: Story = { name: '02 · Панель задач', args: { feature: 'taskbar' } }
export const Voice: Story = { name: '03 · Better Voice', args: { feature: 'voice' } }
export const Usage: Story = { name: '04 · Лимиты ИИ', args: { feature: 'usage' } }
export const Settings: Story = { name: '05 · Настройки', args: { feature: 'settings' } }
