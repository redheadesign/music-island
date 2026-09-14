import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { UsageSettingsSection } from '../../features/usage/UsageSettingsSection'
import type { UsagePreferences, UsageSnapshot } from '../../shared/lib/usageTypes'

function UsageSettingsPreview({ args, locale, colorScheme }: { args: Parameters<typeof UsageSettingsSection>[0]; locale: 'ru' | 'en'; colorScheme: 'dark' | 'light' }) {
  const [preferences, setPreferences] = useState<UsagePreferences>(args.preferences)
  return <div className="settings-window-root" data-color-scheme={colorScheme}>
    <UsageSettingsSection {...args} locale={locale} preferences={preferences} onConnect={(provider) => { args.onConnect(provider); setPreferences((current) => ({ ...current, [`${provider}Enabled`]: true })) }} onDisconnect={(provider) => { args.onDisconnect(provider); setPreferences((current) => ({ ...current, [`${provider}Enabled`]: false })) }} />
  </div>
}

const snapshot: UsageSnapshot = {
  codex: {
    provider: 'codex', source: 'codex-app-server', state: 'connected', plan: 'plus', fetchedAt: 1_789_380_000, staleSince: null, messageCode: null,
    windows: [
      { id: 'primary', label: '5 h', usedPercent: 28, remainingPercent: 72, windowDurationMinutes: 300, resetsAt: 1_789_383_600 },
      { id: 'secondary', label: '7 d', usedPercent: 39, remainingPercent: 61, windowDurationMinutes: 10_080, resetsAt: null },
    ],
  },
  claude: { provider: 'claude', source: 'claude-oauth', state: 'disabled', plan: null, fetchedAt: null, staleSince: null, messageCode: null, windows: [] },
}

const bothSnapshot: UsageSnapshot = {
  ...snapshot,
  claude: {
    provider: 'claude', source: 'claude-oauth', state: 'connected', plan: 'pro', fetchedAt: 1_789_380_000, staleSince: null, messageCode: null,
    windows: [
      { id: 'primary', label: '5 h', usedPercent: 54, remainingPercent: 46, windowDurationMinutes: 300, resetsAt: 1_789_383_600 },
      { id: 'secondary', label: '7 d', usedPercent: 82, remainingPercent: 18, windowDurationMinutes: 10_080, resetsAt: null },
    ],
  },
}

const meta = {
  title: 'Organisms/UsageSettingsSection',
  component: UsageSettingsSection,
  tags: ['autodocs'],
  args: {
    preferences: { codexEnabled: true, claudeEnabled: false }, snapshot, busyProvider: null,
    onConnect: fn(), onDisconnect: fn(), onRefresh: fn(),
  },
  render: (args, context) => <UsageSettingsPreview args={args} locale={context.globals.locale} colorScheme={context.parameters.settingsColorScheme === 'light' ? 'light' : 'dark'} />,
  parameters: { settingsColorScheme: 'dark', workshop: { width: 620, height: 560, note: 'Согласие показано перед действием; история не обращается к Codex или Claude.' } },
} satisfies Meta<typeof UsageSettingsSection>
export default meta
type Story = StoryObj<typeof meta>

export const CodexConnected: Story = {
  name: 'Codex подключён',
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/^5\sч$/)).toBeVisible()
    await expect(canvas.getByText(/^7\sд$/)).toBeVisible()
    await expect(canvas.getAllByText(/^Обновится:/)).toHaveLength(1)
    await expect(canvas.queryByText(/время сброса неизвестно/i)).not.toBeInTheDocument()
  },
}
export const English: Story = {
  name: 'Английский интерфейс',
  globals: { locale: 'en' },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('5 h')).toBeVisible()
    await expect(canvas.getByText('7 d')).toBeVisible()
    await expect(canvas.getAllByText(/^Resets:/)).toHaveLength(1)
    await expect(canvas.queryByText(/reset time unknown/i)).not.toBeInTheDocument()
  },
}
export const BothConnected: Story = {
  name: 'Codex и Claude',
  args: { preferences: { codexEnabled: true, claudeEnabled: true }, snapshot: bothSnapshot },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.brand-logo')).toHaveLength(2)
    await expect(canvas.getAllByRole('progressbar')).toHaveLength(4)
  },
}
export const Light: Story = {
  name: 'Светлое оформление',
  args: { preferences: { codexEnabled: true, claudeEnabled: true }, snapshot: bothSnapshot },
  parameters: { settingsColorScheme: 'light' },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvasElement.querySelector('.settings-window-root')).toHaveAttribute('data-color-scheme', 'light')
    await expect(canvas.getAllByRole('progressbar')).toHaveLength(4)
  },
}
export const Narrow: Story = {
  name: 'Узкое окно · 420 px',
  args: { preferences: { codexEnabled: true, claudeEnabled: true }, snapshot: bothSnapshot },
  parameters: { workshop: { width: 420, height: 760 } },
  play: async ({ canvasElement }) => {
    const settings = canvasElement.querySelector<HTMLElement>('.usage-settings')!
    await expect(settings.scrollWidth).toBeLessThanOrEqual(settings.clientWidth)
    for (const card of settings.querySelectorAll<HTMLElement>('.usage-settings__provider')) {
      await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
    }
  },
}
export const OffByDefault: Story = { name: 'Выключено по умолчанию', args: { preferences: { codexEnabled: false, claudeEnabled: false }, snapshot: null } }
export const NeedsClaudeLogin: Story = {
  name: 'Claude · нужен вход',
  args: {
    preferences: { codexEnabled: false, claudeEnabled: true },
    snapshot: { ...snapshot, claude: { ...snapshot.claude, state: 'needs-auth', messageCode: 'needs-auth' } },
  },
}
