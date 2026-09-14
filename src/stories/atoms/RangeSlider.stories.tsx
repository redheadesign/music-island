import type { Meta, StoryObj } from '@storybook/react-vite'
import { useId } from 'react'
import { useArgs } from 'storybook/preview-api'
import { fn } from 'storybook/test'
import { RangeSlider } from '../../shared/ui/RangeSlider'

const meta = {
  title: 'Atoms/RangeSlider',
  component: RangeSlider,
  tags: ['autodocs'],
  args: {
    value: 55,
    min: 0,
    max: 100,
    step: 1,
    disabled: false,
    'aria-label': 'Сила шумоподавления',
    onChange: fn(),
  },
  argTypes: { value: { control: { type: 'range', min: 0, max: 100 } } },
  render: function Slider(args) {
    const id = useId()
    const [, updateArgs] = useArgs()
    return (
      <div className="sample-control">
        <label htmlFor={id}>
          {args['aria-label']} · {args.value}%
        </label>
        <div className="range-control">
          <RangeSlider
            {...args}
            id={id}
            onChange={(event) => {
              updateArgs({ value: Number(event.currentTarget.value) })
              args.onChange?.(event)
            }}
          />
          <output>{args.value}%</output>
        </div>
      </div>
    )
  },
} satisfies Meta<typeof RangeSlider>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = { name: 'Интерактивный' }
export const Minimum: Story = { name: 'Минимум', args: { value: 0 } }
export const Maximum: Story = { name: 'Максимум', args: { value: 100 } }
export const Disabled: Story = { name: 'Недоступен', args: { disabled: true } }
