import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { BrandLogo, type BrandLogoName } from '../../shared/ui/BrandLogo'

const meta = {
  title: 'Atoms/BrandLogo',
  component: BrandLogo,
  tags: ['autodocs'],
  args: { brand: 'codex', size: 32, label: 'Codex' },
  parameters: {
    workshop: { width: 360, height: 130, note: 'Оригинальная геометрия знаков; сведения об источниках и лицензиях хранятся рядом с компонентом.' },
  },
} satisfies Meta<typeof BrandLogo>
export default meta
type Story = StoryObj<typeof meta>

export const Codex: Story = { name: 'Codex' }

export const AllMarks: Story = {
  name: 'Все поддерживаемые бренды',
  render: () => {
    const marks: Array<[BrandLogoName, string]> = [
      ['openai', 'OpenAI'],
      ['codex', 'Codex'],
      ['claude', 'Claude'],
      ['windows', 'Microsoft Windows'],
      ['yandex-music', 'Яндекс Музыка'],
    ]
    return (
      <div className="sample-row">
        {marks.map(([brand, label]) => <BrandLogo key={brand} brand={brand} size={32} label={label} />)}
      </div>
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('img')).toHaveLength(5)
  },
}

export const Monochrome: Story = {
  name: 'Одноцветный вариант',
  args: { brand: 'claude', label: 'Claude', monochrome: true },
}
