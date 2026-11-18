import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { SettingsWindow } from '../../features/settings/SettingsWindow'
import { MusicModule } from '../../features/music/MusicModule'
import { INTERFACE_THEME_IDS, type InterfaceThemeId } from '../../shared/lib/interfaceTheme'
import { media } from '../fixtures'

const fixture = 'workshop-contract' as InterfaceThemeId
const meta = {
  title: 'Foundations/InterfaceTheme',
  parameters: { workshop: { width: 620 } },
} satisfies Meta
export default meta

export const ThirdTheme: StoryObj<typeof meta> = {
  name: 'Токены дополнительной темы внутри островка',
  render: () => <div style={{ height: 320 }}><SettingsWindow>
    <div className="island-root" data-interface-theme={fixture}>
      <MusicModule media={media} progressMs={73000} progressPercent={34} density="balanced" showArtwork
        showTitle showArtist showProgress showSource={false} showPreviousNext onCommand={() => {}} />
    </div>
  </SettingsWindow></div>,
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('.island-root')!
    const settings = canvasElement.querySelector('.settings-window-root')!
    await expect(INTERFACE_THEME_IDS).not.toContain(fixture)
    await expect(getComputedStyle(root).fontFamily).toContain('Georgia')
    await expect(getComputedStyle(root).getPropertyValue('--fg-primary').trim()).toBe('#d6edc5')
    await expect(getComputedStyle(root).getPropertyValue('--control-height').trim()).toBe('46px')
    await expect(getComputedStyle(settings).fontFamily).not.toContain('Georgia')
    await expect(getComputedStyle(settings).getPropertyValue('--fg-primary').trim()).not.toBe('#d6edc5')
  },
}
