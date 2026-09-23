import type { Meta, StoryObj } from '@storybook/react-vite'
import type { CSSProperties } from 'react'
import { expect } from 'storybook/test'
import { UsageStatusChip } from '../../features/usage/UsageStatusChip'
import type { UsageSnapshot } from '../../shared/lib/usageTypes'

const snapshot: UsageSnapshot = {
  codex: {
    provider: 'codex', source: 'codex-app-server', state: 'connected', plan: 'plus',
    fetchedAt: 1_789_380_000, staleSince: null, messageCode: null,
    windows: [
      { id: 'primary', label: '5 h', usedPercent: 28, remainingPercent: 72, windowDurationMinutes: 300, resetsAt: 1_789_383_600 },
      { id: 'secondary', label: '7 d', usedPercent: 39, remainingPercent: 61, windowDurationMinutes: 10_080, resetsAt: 1_789_898_400 },
    ],
  },
  claude: {
    provider: 'claude', source: 'claude-oauth', state: 'connected', plan: null,
    fetchedAt: 1_789_380_000, staleSince: null, messageCode: null,
    windows: [
      { id: 'primary', label: '5 h', usedPercent: 46, remainingPercent: 54, windowDurationMinutes: 300, resetsAt: 1_789_383_600 },
      { id: 'secondary', label: '7 d', usedPercent: 77, remainingPercent: 23, windowDurationMinutes: 10_080, resetsAt: null },
    ],
  },
}

const meta = {
  title: 'Molecules/UsageStatusChip',
  component: UsageStatusChip,
  tags: ['autodocs'],
  args: { snapshot, enabledProviders: ['codex'] },
  parameters: { workshop: { width: 260, height: 140, note: 'Локальные фиксированные данные; подключения не выполняются.' } },
  render: (args, context) => {
    const scale = typeof context.parameters.usageScale === 'number' ? context.parameters.usageScale : 1
    return <div style={{ width: 'fit-content', transform: `scale(${scale})`, transformOrigin: 'top left' } as CSSProperties}><UsageStatusChip {...args} /></div>
  },
} satisfies Meta<typeof UsageStatusChip>
export default meta
type Story = StoryObj<typeof meta>

export const Codex: Story = {
  name: 'Codex · компактно',
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.brand-logo')).toHaveLength(1)
    await expect(canvasElement.querySelector('.usage-chip')).toHaveAttribute('data-layout', 'compact')
  },
}
export const Both: Story = {
  name: 'Codex и Claude · компактно',
  args: { enabledProviders: ['codex', 'claude'] },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector<HTMLElement>('.usage-chip')!
    await expect(chip.scrollWidth).toBeLessThanOrEqual(chip.clientWidth)
    await expect(chip).toHaveAttribute('data-layout', 'compact')
  },
}
export const Expanded: Story = {
  name: 'Раскрытая вертикальная капсула',
  args: { enabledProviders: ['codex', 'claude'], compact: false },
  parameters: { workshop: { width: 240, height: 390, note: 'Два провайдера, реальные окна лимитов и самая важная цифра — остаток.' } },
  play: async ({ canvas, canvasElement }) => {
    const chip = canvasElement.querySelector<HTMLElement>('.usage-chip')!
    await expect(chip).toHaveAttribute('data-layout', 'expanded')
    await expect(Math.round(chip.getBoundingClientRect().width)).toBe(124)
    await expect(canvas.getAllByRole('progressbar')).toHaveLength(4)
    await expect(canvasElement.querySelectorAll('.brand-logo')).toHaveLength(2)
  },
}
export const Loading: Story = { name: 'Загрузка без скачка размера', args: { snapshot: null, enabledProviders: ['codex'] } }
export const Stale: Story = {
  name: 'Устаревшие данные',
  args: { snapshot: { ...snapshot, codex: { ...snapshot.codex, state: 'stale', staleSince: 1_789_380_300, messageCode: 'offline' } } },
}

export const CompactScaled: Story = {
  name: 'Два компактных · масштаб 135%',
  args: { enabledProviders: ['codex', 'claude'], compact: true },
  parameters: { usageScale: 1.35, workshop: { width: 250, height: 100 } },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector<HTMLElement>('.usage-chip')!
    await expect(chip.getBoundingClientRect().width / chip.offsetWidth).toBeCloseTo(1.35, 1)
    await expect(chip).toHaveAttribute('data-layout', 'compact')
  },
}

export const EdgeValues: Story = {
  name: 'Краевые значения · слева и справа',
  parameters: {workshop: {width: 420, height: 500}},
  render: () => <div style={{display: 'grid', gap: 16}}>{[0, 9, 99, 100, null].map((value) => <div key={String(value)} style={{display: 'flex', justifyContent: 'space-between', gap: 40}}>{(['codex', 'claude'] as const).map((provider) => <UsageStatusChip key={provider} enabledProviders={[provider]} snapshot={{...snapshot, [provider]: {...snapshot[provider], windows: [{...snapshot[provider].windows[0], remainingPercent: value}]}}} />)}</div>)}</div>,
  play: async ({canvasElement}) => {
    for (const node of canvasElement.querySelectorAll<HTMLElement>('.usage-chip__compact-provider')) {
      await expect(node.scrollWidth).toBeLessThanOrEqual(node.clientWidth)
      const bounds=node.getBoundingClientRect(), ring=node.querySelector('.usage-chip__ring-logo')!.getBoundingClientRect(), value=node.querySelector('.usage-chip__compact-value')!.getBoundingClientRect()
      await expect(Math.abs((ring.left-bounds.left)-(bounds.right-value.right))).toBeLessThan(1)
      await expect(ring.width).toBe(32)
    }
  },
}
