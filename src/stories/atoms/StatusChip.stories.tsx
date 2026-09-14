import type { Meta, StoryObj } from '@storybook/react-vite'
import { StatusChip } from '../../shared/ui/StatusChip'

const meta = {
  title: 'Atoms/StatusChip',
  component: StatusChip,
  tags: ['autodocs'],
  args: { children: 'Подключено', tone: 'success', className: 'sample-pill' },
  argTypes: {
    tone: {
      control: 'inline-radio',
      options: ['neutral', 'success', 'warning', 'danger'],
    },
    className: { table: { disable: true } },
  },
} satisfies Meta<typeof StatusChip>
export default meta
type Story = StoryObj<typeof meta>
export const Connected: Story = { name: 'Подключено' }
export const Waiting: Story = {
  name: 'Ожидание',
  args: { tone: 'neutral', children: 'Ожидание' },
}
export const Warning: Story = {
  name: 'Требует внимания',
  args: { tone: 'warning', children: 'Нет сигнала' },
}
export const Error: Story = {
  name: 'Ошибка',
  args: { tone: 'danger', children: 'Не удалось подключиться' },
}
export const AllTones: Story = {
  name: 'Все варианты',
  render: () => (
    <div className="sample-row">
      {(['neutral', 'success', 'warning', 'danger'] as const).map((tone) => (
        <StatusChip key={tone} tone={tone} className="sample-pill">
          {tone}
        </StatusChip>
      ))}
    </div>
  ),
}
