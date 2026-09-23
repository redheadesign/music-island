import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { HoverCoach } from '../../features/overlay/HoverCoach'
const meta = {
  title: 'Molecules/HoverCoach', component: HoverCoach,
  args: { label: 'Подведите мышь к верхнему краю' },
  parameters: { workshop: { width: 520, height: 220 } },
  render: (args, context) => <div className={context.parameters.reducedMotion ? 'reduced-motion' : ''} style={{ position: 'relative', height: 180 }}><HoverCoach {...args} /></div>,
} satisfies Meta<typeof HoverCoach>
export default meta
type Story = StoryObj<typeof meta>
export const TopEdge: Story = { name: 'Подсказка верхнего края' }
export const English: Story = { name: 'Top edge · English', args: { label: 'Move your mouse to the top edge' } }
export const ReducedMotion: Story = { name: 'Без движения', parameters: { reducedMotion: true }, play: async ({ canvasElement }) => {
  await expect(getComputedStyle(canvasElement.querySelector('.hover-coach__cursor')!).animationName).toBe('none')
} }
