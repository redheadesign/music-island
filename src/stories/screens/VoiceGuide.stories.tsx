import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent } from 'storybook/test'
import { VoiceGuidePage } from '../../features/plugins/voice/VoiceGuidePage'
import { messages } from '../../features/plugins/voice/voiceMessages'

const meta = {
  title: 'Screens/VoiceGuide',
  component: VoiceGuidePage,
  args: {
    locale: 'ru',
    onBack: fn(),
    openCableSiteLabel: messages.ru.openCableSite,
    onOpenCableSite: fn(),
  },
  parameters: {
    workshop: {
      width: 760,
      note: 'Инструкция из приложения. Кнопки записывают действия в Storybook; сайт и установка драйвера не запускаются.',
    },
  },
  render: (args, context) => (
    <div className="settings-window-root">
      <VoiceGuidePage
        {...args}
        locale={context.globals.locale}
        openCableSiteLabel={messages[context.globals.locale === 'en' ? 'en' : 'ru'].openCableSite}
      />
    </div>
  ),
} satisfies Meta<typeof VoiceGuidePage>
export default meta
type Story = StoryObj<typeof meta>

export const Guides: Story = { name: 'Первое подключение' }
export const English: Story = { name: 'Английская инструкция', globals: { locale: 'en' } }
export const Narrow: Story = { name: 'Узкая область', parameters: { workshop: { width: 420 } } }
export const Troubleshooting: Story = {
  name: 'Открытая подсказка',
  play: async ({ canvas, args }) => {
    const disclosure = canvas.getByText(/Нет CABLE Input или CABLE Output|CABLE Input or CABLE Output is missing/)
    await userEvent.click(disclosure)
    await expect(disclosure.closest('details')).toHaveAttribute('open')
    await userEvent.click(canvas.getByRole('button', { name: /Сайт VB-Cable|VB-Cable website/ }))
    await expect(args.onOpenCableSite).toHaveBeenCalledTimes(1)
    await userEvent.click(canvas.getByRole('button', { name: /К настройке микрофона|Back to microphone settings/ }))
    await expect(args.onBack).toHaveBeenCalledTimes(1)
  },
}
