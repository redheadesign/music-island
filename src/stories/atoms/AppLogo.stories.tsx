import type { Meta, StoryObj } from '@storybook/react-vite'
import { AppLogo } from '../../shared/ui/AppLogo'

function LogoSizes({ variant = 'standard' }: { variant?: 'standard' | 'portrait' | 'intro' }) {
  return <div style={{ display: 'grid', gap: 24 }}>{(['dark', 'light'] as const).map(theme => <section key={theme} className="auxiliary-ui" data-color-scheme={theme} style={{ padding: 32, background: 'var(--surface-canvas)', color: 'var(--fg-primary)', display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>{[16,24,40,80,128,256].map(size => <figure key={size} style={{ margin: 0, display: 'grid', justifyItems: 'center', gap: 16 }}><AppLogo variant={variant} size={size} alt="Music Island" /><figcaption>{size} px</figcaption></figure>)}</section>)}</div>
}
const meta = { title: 'Atoms/AppLogo', component: LogoSizes, parameters: { layout: 'fullscreen' } } satisfies Meta<typeof LogoSizes>
export default meta
type Story = StoryObj<typeof meta>
export const Sizes: Story = { name: 'Основной знак · размеры и две темы' }
export const Portrait: Story = { name: 'Портрет · о программе и финал', args: { variant: 'portrait' } }
export const Intro: Story = { name: 'Белый знак · запуск', args: { variant: 'intro' } }
