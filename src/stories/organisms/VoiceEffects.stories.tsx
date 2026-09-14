import type { Meta, StoryObj } from '@storybook/react-vite'
import { useArgs } from 'storybook/preview-api'
import { fn } from 'storybook/test'
import { VoiceEffects } from '../../features/plugins/voice/VoiceEffects'
import { messages } from '../../features/plugins/voice/voiceMessages'

const meta = {
  title: 'Organisms/VoiceEffects',
  component: VoiceEffects,
  args: {
    locale: 'ru', label: messages.ru.extras,
    disabled: false, activeEffect: null, onToggle: fn(),
  },
  parameters: { workshop: { width: 500, note: 'Тот же блок, что в главной карточке Better Voice. Нажмите ещё раз, чтобы выключить эффект. В приложении включённый эффект работает на 100%.' } },
  render: function Effects(args, context) {
    const [, updateArgs] = useArgs()
    const locale = context.globals.locale === 'en' ? 'en' : 'ru'
    return <VoiceEffects {...args} locale={locale} label={messages[locale].extras}
      onToggle={(effect) => { args.onToggle(effect); updateArgs({ activeEffect: args.activeEffect === effect ? null : effect }) }} />
  },
} satisfies Meta<typeof VoiceEffects>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = { name: 'Быстрые переключатели' }
export const Robot: Story = { name: 'Робот включён', args: { activeEffect: 4 } }
export const Echo: Story = { name: 'Эхо включено', args: { activeEffect: 6 } }
export const Distortion: Story = { name: 'Перегруз включён', args: { activeEffect: 2 } }
export const Disabled: Story = { name: 'Обработка выключена', args: { disabled: true } }
export const DisabledActive: Story = { name: 'Выбранный эффект временно недоступен', args: { disabled: true, activeEffect: 4 } }
export const Narrow: Story = { name: 'Узкая область', args: { activeEffect: 4 }, parameters: { workshop: { width: 280 } } }
export const English: Story = { name: 'Английские подписи', args: { activeEffect: 2 }, globals: { locale: 'en' } }
