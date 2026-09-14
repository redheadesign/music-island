import type { Meta, StoryObj } from '@storybook/react-vite'
import { useArgs } from 'storybook/preview-api'
import { fn } from 'storybook/test'
import { AccentColorPicker } from '../../features/settings/AccentColorPicker'

const meta = {
  title: 'Molecules/AccentColorPicker',
  component: AccentColorPicker,
  tags: ['autodocs'],
  args: {
    value: '#f76100',
    label: 'Цвет акцента',
    customLabel: 'Свой цвет',
    onChange: fn().mockName('accent.change'),
  },
  parameters: { workshop: { width: 480, height: 560 } },
  render: function Picker(args) {
    const [, updateArgs] = useArgs()
    return (
      <AccentColorPicker
        {...args}
        onChange={(value) => {
          updateArgs({ value })
          args.onChange(value)
        }}
      />
    )
  },
} satisfies Meta<typeof AccentColorPicker>
export default meta
export const Default: StoryObj<typeof meta> = { name: 'Палитра и свой цвет' }
export const Custom: StoryObj<typeof meta> = {
  name: 'Произвольный цвет',
  args: { value: '#48a490' },
}
