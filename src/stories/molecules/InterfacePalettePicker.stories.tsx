import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { InterfacePalettePicker } from '../../features/settings/InterfacePalettePicker'
import { buildInterfacePaletteStyle, type InterfacePaletteId } from '../../shared/lib/interfacePalette'
import type { Locale } from '../../shared/lib/types'

function PalettePreview({ locale, light = false }: { locale: Locale; light?: boolean }) {
  const [value, setValue] = useState<InterfacePaletteId>('custom')
  const colorScheme = light ? 'light' : 'dark'
  const accent = '#f76100'
  return (
    <div
      className="settings-panel"
      data-color-scheme={colorScheme}
      data-interface-theme="glass"
      data-interface-palette={value}
      style={buildInterfacePaletteStyle(value, colorScheme, accent) as CSSProperties}
    >
      <InterfacePalettePicker value={value} customAccent={accent} onChange={setValue} locale={locale} />
    </div>
  )
}

const meta = {
  title: 'Molecules/InterfacePalettePicker',
  component: InterfacePalettePicker,
  parameters: { workshop: { width: 590 } },
  render: (_args, context) => <PalettePreview locale={context.globals.locale} light={context.parameters.settingsColorScheme === 'light'} />,
} satisfies Meta<typeof InterfacePalettePicker>

export default meta
type Story = StoryObj<typeof meta>
const args = { value: 'custom', customAccent: '#f76100', locale: 'ru', onChange: () => undefined } as const

export const Presets: Story = {
  name: 'Палитры · тёмное окно',
  args,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', { name: /^(Цветовая палитра|Color palette)$/ })
    await userEvent.click(trigger)
    const ocean = canvas.getByRole('button', { name: /^(Океан|Ocean)$/ })
    const custom = canvas.getByRole('button', { name: /^(Свой акцент|Custom accent)$/ })
    await expect(custom).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(ocean)
    await expect(ocean).toHaveAttribute('aria-pressed', 'true')
    await expect(custom).toHaveAttribute('aria-pressed', 'false')
    await expect(canvasElement.querySelector('.settings-panel')).toHaveAttribute('data-interface-palette', 'ocean')
    await userEvent.keyboard('{Escape}')
    await expect(trigger).toHaveFocus()
    await expect(trigger).toHaveAccessibleDescription(/^(Океан|Ocean)$/)
    await userEvent.click(trigger)
  },
}

export const Light: Story = {
  name: 'Палитры · светлое окно',
  args,
  parameters: { settingsColorScheme: 'light' },
}
