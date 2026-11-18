import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent } from 'storybook/test'
import { InterfacePalettePicker } from '../../features/settings/InterfacePalettePicker'
import type { InterfacePaletteId } from '../../shared/lib/interfacePalette'
import type { Locale } from '../../shared/lib/types'

function PalettePreview({ locale }: { locale: Locale }) {
  const [value, setValue] = useState<InterfacePaletteId>('custom')
  return <div className="settings-control-group"><InterfacePalettePicker value={value} customAccent="#f76100" onChange={setValue} locale={locale} /></div>
}

const meta = {
  title: 'Molecules/InterfacePalettePicker', component: InterfacePalettePicker,
  parameters: { workshop: { width: 420 } },
  render: (_args, context) => <PalettePreview locale={context.globals.locale} />,
} satisfies Meta<typeof InterfacePalettePicker>
export default meta
export const Presets: StoryObj<typeof meta> = {
  name: 'Палитры островка',
  args: { locale: 'ru', customAccent: '#f76100', value: 'custom', onChange: () => {} },
  play: async ({ canvas }) => {
    const custom = canvas.getByRole('radio', { name: /^(Свой акцент|Custom accent)$/ })
    const ocean = canvas.getByRole('radio', { name: /^(Океан|Ocean)$/ })
    await expect(custom).toBeChecked()
    await userEvent.click(ocean)
    await expect(ocean).toBeChecked()
    await expect(custom).not.toBeChecked()
  },
}
