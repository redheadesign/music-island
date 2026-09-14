import type { Meta, StoryObj } from '@storybook/react-vite'
import { MarqueeText } from '../../shared/ui/MarqueeText'

const meta = {
  title: 'Atoms/MarqueeText',
  component: MarqueeText,
  tags: ['autodocs'],
  args: { text: 'Тёплый вечер' },
  parameters: {
    workshop: {
      width: 240,
      note: 'Текст прокручивается только при переполнении. Сравните короткое и длинное название.',
    },
  },
} satisfies Meta<typeof MarqueeText>
export default meta
type Story = StoryObj<typeof meta>
export const Short: Story = { name: 'Короткое название' }
export const Long: Story = {
  name: 'Длинное название',
  args: {
    text: 'Очень длинное название любимой песни — концертная версия с оркестром',
  },
}
