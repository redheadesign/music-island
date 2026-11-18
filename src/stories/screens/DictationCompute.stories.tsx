import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { useDictationController } from '../../app/dictation/useDictationController'
import { DictationSettings } from '../../features/dictation/DictationSettings'
import { dictationModels } from '../dictationFixtures'
import { dictationApi } from '../mocks/dictationApi'

function ComputeSettings({ locale }: { locale: 'ru' | 'en' }) {
  const controller = useDictationController(true, true)
  return <div className="settings-panel" data-interface-theme="glass" data-color-scheme="dark">
    <DictationSettings page="advanced" locale={locale} controller={controller}
      onEnable={controller.enable} onPage={() => {}} />
  </div>
}

const meta = {
  title: 'Screens/DictationCompute',
  component: ComputeSettings,
  args: { locale: 'ru' },
  parameters: { settingsPreviewScene: true, workshop: { width: 720 } },
} satisfies Meta<typeof ComputeSettings>
export default meta
type Story = StoryObj<typeof meta>
const label = 'Фоновое распознавание GigaAM'

export const BackgroundRecognition: Story = {
  name: 'GigaAM · распознавание во время записи',
  beforeEach: async () => {
    const gigaam = dictationModels.find(model => model.supports_background_recognition)!
    await dictationApi.setActiveModel(gigaam.id)
  },
  play: async ({ canvasElement }) => {
    const control = await within(canvasElement).findByRole('switch', { name: label })
    await expect(control).not.toBeChecked()
    await userEvent.click(control)
    await waitFor(() => expect(control).toBeChecked())
    await expect((await dictationApi.getAppSettings()).gigaam_background_recognition).toBe(true)
    await userEvent.click(control)
    await waitFor(() => expect(control).not.toBeChecked())
    await expect((await dictationApi.getAppSettings()).gigaam_background_recognition).toBe(false)
  },
}

export const OtherEngine: Story = {
  name: 'Другой движок · сохранённый выбор GigaAM',
  beforeEach: async () => { await dictationApi.changeGigaamBackgroundRecognition(true) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('button', { name: 'Движок GGML / GGUF' })).toBeVisible()
    await expect(canvas.queryByRole('switch', { name: label })).not.toBeInTheDocument()
    await expect((await dictationApi.getAppSettings()).gigaam_background_recognition).toBe(true)
  },
}
