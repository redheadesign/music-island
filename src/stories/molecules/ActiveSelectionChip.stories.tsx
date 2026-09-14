import type { Meta, StoryObj } from '@storybook/react-vite'
import type { CSSProperties } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { ActiveSelectionChip } from '../../features/music/wave/ActiveSelectionChip'

const meta = {
  title: 'Molecules/ActiveSelectionChip',
  component: ActiveSelectionChip,
  tags: ['autodocs'],
  args: {
    selection: {
      id: 'workshop-wave',
      label: 'Хочется инди',
      iconUrl: null,
      removable: true,
    },
    onClear: fn().mockName('wave.clear'),
    disabled: false,
  },
  parameters: { workshop: { width: 320 } },
  render: (args, context) => (
    <div style={{ width: '100%', height: 64, paddingBottom: 32, '--artwork-primary': context.parameters.artworkPrimary ?? '244, 88, 90', '--artwork-secondary': '30, 150, 220' } as CSSProperties}>
      <div style={{ position: 'relative', height: 32 }}><ActiveSelectionChip {...args} /></div>
    </div>
  ),
} satisfies Meta<typeof ActiveSelectionChip>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {
  name: 'Активная подборка',
  play: async ({ canvasElement, args }) => {
    const chip = within(canvasElement).getByLabelText(`Активная подборка: ${args.selection.label}`)
    await expect(getComputedStyle(chip).backgroundColor).toBe('rgb(24, 25, 28)')
    await expect(getComputedStyle(chip).boxShadow).toBe('none')
    await expect(chip.querySelector('circle[mask]')).not.toBeNull()
    await userEvent.click(within(chip).getByRole('button'))
    await expect(args.onClear).toHaveBeenCalledTimes(1)
  },
}
export const Favorites: Story = {
  name: 'Любимое · прозрачный крестик',
  globals: { accent: '#9fe1bd' },
  args: { selection: { id: 'favorites', label: 'Любимое', iconUrl: null, removable: true } },
}
export const CoolArtwork: Story = {
  name: 'Нейтральный фон с другой обложкой',
  parameters: { artworkPrimary: '28, 100, 230' },
  play: Default.play,
}
export const Disabled: Story = { name: 'Отключение недоступно', args: { disabled: true } }
export const LongLabel: Story = {
  name: 'Длинное название',
  args: {
    selection: {
      id: 'long-wave',
      label: 'Наслаждаюсь твоей компанией весь вечер',
      iconUrl: null,
      removable: true,
    },
  },
}
export const Fixed: Story = {
  name: 'Без удаления',
  args: {
    selection: {
      id: 'fixed-wave',
      label: 'Моя волна',
      iconUrl: null,
      removable: false,
    },
  },
}
