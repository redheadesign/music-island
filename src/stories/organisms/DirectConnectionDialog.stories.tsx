import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { DirectConnectionDialog } from '../../features/settings/DirectConnectionDialog'

const meta = {
  title: 'Organisms/DirectConnectionDialog',
  component: DirectConnectionDialog,
  args: {
    busy: false,
    error: null,
    onCancel: fn().mockName('direct.cancel'),
    onConnect: fn().mockName('direct.connect'),
  },
  parameters: {
    workshop: {
      width: 500,
      note: 'Настоящий диалог подключения. Кнопки здесь записывают событие; подключение и перезапуск не выполняются. Модальный фон, Escape и удержание фокуса показаны в Screens / Settings / Согласие на прямое подключение.',
    },
    controls: { exclude: ['ref', 'locale'] },
  },
  render: (args, context) => <DirectConnectionDialog {...args} locale={context.globals.locale} />,
} satisfies Meta<typeof DirectConnectionDialog>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  name: 'Перед подключением',
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('dialog')).toHaveAccessibleDescription(/перезапустится|will restart/)
    await userEvent.click(canvas.getByRole('button', { name: /^(Подключить|Connect)$/ }))
    await expect(args.onConnect).toHaveBeenCalledTimes(1)
    await userEvent.click(canvas.getByRole('button', { name: /^(Отмена|Cancel)$/ }))
    await expect(args.onCancel).toHaveBeenCalledTimes(1)
  },
}

export const Busy: Story = {
  name: 'Подключение',
  args: { busy: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /Подключение|Connecting/ })).toBeDisabled()
    await expect(canvas.getByRole('status')).toHaveTextContent(/Подключение|Connecting/)
    await userEvent.click(canvas.getByRole('button', { name: /^(Закрыть|Close)$/ }))
    await expect(args.onCancel).toHaveBeenCalledTimes(1)
    await expect(args.onConnect).not.toHaveBeenCalled()
  },
}

export const Error: Story = {
  name: 'Не удалось подключиться',
  args: { error: 'Приложение Яндекс Музыки не найдено. Установите его и повторите подключение.' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent('Приложение Яндекс Музыки не найдено.')
    await userEvent.click(canvas.getByRole('button', { name: /^(Повторить подключение|Retry connection)$/ }))
    await expect(args.onConnect).toHaveBeenCalledTimes(1)
  },
}

export const Narrow: Story = {
  name: 'Узкий диалог · 320 px',
  parameters: { workshop: { width: 320 } },
}

export const ErrorNarrow: Story = {
  name: 'Длинная ошибка · 320 px',
  args: {
    error: 'Яндекс Музыка запустилась, но управление плеером пока недоступно. Дождитесь загрузки приложения и повторите подключение. Если ошибка повторяется, вернитесь на Windows.',
  },
  parameters: { workshop: { width: 320 } },
}

export const English: Story = {
  name: 'English',
  globals: { locale: 'en' },
}
