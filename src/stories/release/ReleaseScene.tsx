import { useRef, useState } from 'react'
import { exportReleaseScene } from './exportReleaseScene'
import { ReleaseBackdrop } from './ReleaseBackdrop'
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
    island: { title: <>Соберите свой<br />островок</>, detail: 'Выберите нужные кнопки и измените размер прямо в превью' },
    taskbar: { title: <>Управляйте музыкой<br />из панели задач</>, detail: 'Пауза, следующий трек и любимые кнопки рядом с треем Windows' },
    voice: { title: <>Меньше шума<br />в микрофоне</>, detail: 'Включите шумоподавление и проверьте, как звучит ваш голос' },
    usage: { title: <>Сколько осталось<br />до лимита</>, detail: 'Смотрите остаток лимитов Codex и Claude рядом с плеером' },
    settings: { title: <>Настройте островок<br />под себя</>, detail: 'Выберите кнопки, размер и оформление — светлое или тёмное' },
  },
  en: {
    island: { title: 'Build your own island', detail: 'Choose your controls and resize them directly in the preview' },
    taskbar: { title: 'Control music from your taskbar', detail: 'Pause, skip and keep your favorite controls beside the Windows tray' },
    voice: { title: 'Less noise from your microphone', detail: 'Turn on noise reduction and listen to how your voice sounds' },
    usage: { title: 'See how much usage is left', detail: 'Check your remaining Codex and Claude limits beside the player' },
    settings: { title: 'Make your island your own', detail: 'Choose your controls, size and a light or dark theme' },
  },
}
type Feature = keyof typeof copy.en

export function ReleaseScene({ feature, format, showExport = true }: { feature: Feature; format: 'telegram' | 'readme'; showExport?: boolean }) {
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
    <ReleaseBackdrop />
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
  </article>{showExport ? <nav className="release-export" aria-label="Image export"><button type="button" onClick={exportImage}>{exportStatus}</button>{exportUrl && <a data-release-download href={exportUrl} download={`${feature}-${format}.png`}>Download PNG</a>}</nav> : null}</>
}
