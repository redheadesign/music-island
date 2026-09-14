import type { Meta, StoryObj } from '@storybook/react-vite'
import { LevelMeter } from '../../features/plugins/voice/LevelMeter'
import { audioStats } from '../fixtures'

const meta = {
  title: 'Molecules/LevelMeter',
  component: LevelMeter,
  tags: ['autodocs'],
  args: {
    stats: audioStats,
    running: true,
    overloadLabel: 'Микрофон перегружен',
    comfortTip: 'Комфортный уровень речи',
    yellTip: 'Громкий сигнал',
    targetTip: 'Целевой уровень',
    targetKind: 'calls',
    peakHoldDb: -10,
  },
  parameters: {
    workshop: {
      width: 500,
      note: 'Уровни заданы для воспроизводимого примера. Микрофон не используется.',
    },
  },
} satisfies Meta<typeof LevelMeter>
export default meta
type Story = StoryObj<typeof meta>
export const Speech: Story = { name: 'Обычная речь' }
export const Overload: Story = {
  name: 'Перегрузка',
  args: { stats: { ...audioStats, input_peak: -1, input_clipping: true } },
}
export const Silence: Story = {
  name: 'Тишина',
  args: {
    stats: { ...audioStats, input_peak: -90, post_gain_peak: -90 },
    peakHoldDb: null,
  },
}
export const Stopped: Story = {
  name: 'Остановлен',
  args: { running: false, peakHoldDb: null },
}
