import { useState, type ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ColorSwatches } from '../../shared/ui/ColorSwatches'
const options = [
  { value: 'white', label: 'Белый', color: '#ffffff' },
  { value: 'blue', label: 'Синий', color: '#3987e8' },
  { value: 'cyan', label: 'Бирюзовый', color: '#36aeb7' },
  { value: 'rose', label: 'Розовый', color: '#d36d99' },
  { value: 'amber', label: 'Янтарный', color: '#c89442' },
]
function SwatchesDemo({ args }: { args: ComponentProps<typeof ColorSwatches> }) {
  const [value, setValue] = useState(args.value)
  return <div className="settings-panel" style={{ padding: 24, background: 'var(--surface-panel)', borderRadius: 16 }}><ColorSwatches {...args} value={value} onChange={next => { setValue(next); args.onChange(next) }} /></div>
}
const meta = { title: 'Atoms/ColorSwatches', component: ColorSwatches, args: { value: 'blue', options, ariaLabel: 'Цвет', onChange: fn<(value: string) => void>() }, parameters: { workshop: { width: 420 } }, render: args => <SwatchesDemo key={args.value} args={args} /> } satisfies Meta<typeof ColorSwatches>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = { name: 'Цвета · тёмная тема' }
