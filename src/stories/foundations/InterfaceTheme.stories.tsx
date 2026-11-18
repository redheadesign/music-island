import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { SettingsWindow } from '../../features/settings/SettingsWindow'
import { TaskbarPlayer } from '../../features/taskbar/TaskbarPlayer'
import { INTERFACE_THEME_IDS, type InterfaceThemeId } from '../../shared/lib/interfaceTheme'
import { Select } from '../../shared/ui/Select'
import { media } from '../fixtures'

// This ID is compiled exclusively by the workshop. Production fixtures and saved choices stay separate.
const fixture = 'workshop-contract' as InterfaceThemeId
const meta = {
  title: 'Foundations/InterfaceTheme',
  parameters: { handlesInterfaceTheme: true, workshop: { width: 620 } },
} satisfies Meta
export default meta

export const ThirdTheme: StoryObj<typeof meta> = {
  name: 'Контракт третьей темы · окно, панель задач и меню',
  render: () => <div>
    <div style={{ height: 210 }}><SettingsWindow interfaceTheme={fixture} colorScheme="light">
      <Select ariaLabel="Проверка темы" value="one" options={[{ value: 'one', label: 'Первая' }, { value: 'two', label: 'Вторая' }]} onChange={() => {}} />
    </SettingsWindow></div>
    <TaskbarPlayer interfaceTheme={fixture} snapshot={media} locale="ru" onCommand={() => {}} />
  </div>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', { name: 'Проверка темы' })
    const player = canvas.getByRole('region', { name: 'Плеер в панели задач' })
    await expect(INTERFACE_THEME_IDS).not.toContain(fixture)
    await expect(getComputedStyle(trigger).fontFamily).toContain('Georgia')
    await expect(getComputedStyle(trigger).paddingLeft).toBe('18px')
    await expect(getComputedStyle(trigger).color).toBe('rgb(56, 81, 35)')
    await expect(getComputedStyle(player).getPropertyValue('--fg-primary').trim()).toBe('#d6edc5')
    await expect(getComputedStyle(player).fontFamily).toContain('Georgia')
    await userEvent.click(trigger)
    const menu = await within(canvasElement.ownerDocument.body).findByRole('listbox')
    await expect(canvasElement.contains(menu)).toBe(false)
    await waitFor(() => expect(menu).toHaveAttribute('data-interface-theme', fixture))
    const selected = within(menu).getByRole('option', { selected: true })
    await expect(selected).toHaveStyle({ color: '#ffffff', backgroundColor: '#385123' })
    const option = within(menu).getByRole('option', { selected: false })
    await expect(getComputedStyle(option).minHeight).toBe('46px')
    await expect(getComputedStyle(menu).getPropertyValue('--surface-raised').trim()).toBe('#e8efdd')
    await expect(getComputedStyle(option).color).toBe('rgb(56, 81, 35)')
    await expect(getComputedStyle(option).fontFamily).toContain('Georgia')
    await expect(getComputedStyle(menu).paddingLeft).toBe('6px')
    if (!matchMedia('(prefers-reduced-transparency: reduce), (forced-colors: active)').matches) {
      await expect(getComputedStyle(menu).backdropFilter).toContain('blur(')
    }
    await userEvent.keyboard('{Escape}')
    await expect(trigger).toHaveFocus()
  },
}
