import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn, expect, userEvent } from 'storybook/test'
import { Heart, Play, Settings2 } from 'lucide-react'
import { IconButton } from '../../shared/ui/IconButton'

const meta = {
  title: 'Atoms/IconButton',
  component: IconButton,
  tags: ['autodocs'],
  args: {
    children: <Play />,
    'aria-label': 'Воспроизвести',
    disabled: false,
    className: 'sample-icon',
    onClick: fn().mockName('button.click'),
  },
  argTypes: {
    children: { control: false },
    className: { table: { disable: true } },
  },
  parameters: {
    workshop: { width: 100 },
    docs: {
      description: {
        component:
          'Круглая кнопка с иконкой. Проверьте наведение, фокус с клавиатуры и недоступное состояние.',
      },
    },
  },
} satisfies Meta<typeof IconButton>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {
  name: 'Обычная',
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Воспроизвести' }))
    await expect(args.onClick).toHaveBeenCalled()
  },
}
export const Disabled: Story = { name: 'Недоступна', args: { disabled: true } }
export const Favorite: Story = {
  name: 'Избранное',
  args: { children: <Heart />, 'aria-label': 'В избранное' },
}
export const Settings: Story = {
  name: 'Настройки',
  args: { children: <Settings2 />, 'aria-label': 'Открыть настройки' },
}
