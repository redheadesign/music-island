import type { Meta, StoryObj } from '@storybook/react-vite'
import { GlassSurface } from '../../shared/ui/GlassSurface'
const meta = {
  title: 'Atoms/GlassSurface',
  component: GlassSurface,
  tags: ['autodocs'],
  args: {
    className: 'sample-surface',
    children: (
      <>
        <h3>Поверхность</h3>
        <p>Основа карточек и групп настроек.</p>
      </>
    ),
  },
  argTypes: { children: { control: false } },
  globals: { surface: 'desktop' },
} satisfies Meta<typeof GlassSurface>
export default meta
export const Default: StoryObj<typeof meta> = { name: 'На фоне рабочего стола' }
